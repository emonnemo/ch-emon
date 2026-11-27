from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.vocab import ReviewLog, UserVocab
from app.schemas.vocab import (
    DueCardOut,
    ReviewResultOut,
    ReviewStatsOut,
    SubmitReviewRequest,
    VocabOut,
)
from app.services.srs import apply_review, format_interval, preview_intervals

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


@router.get("/due", response_model=list[DueCardOut])
def get_due_reviews(
    limit: int = Query(default=30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DueCardOut]:
    now = datetime.now(timezone.utc)
    stmt = (
        select(UserVocab)
        .where(
            UserVocab.user_id == current_user.id,
            UserVocab.due_at <= now,
        )
        .order_by(UserVocab.due_at.asc(), UserVocab.id.asc())
        .limit(limit)
    )
    cards = list(db.scalars(stmt).all())
    results: list[DueCardOut] = []
    for card in cards:
        base = VocabOut.model_validate(card)
        previews = preview_intervals(card.fsrs_card, fallback_due=card.due_at, now=now)
        results.append(DueCardOut(**base.model_dump(), interval_previews=previews))
    return results


@router.post("/{vocab_id}", response_model=ReviewResultOut)
def submit_review(
    vocab_id: int,
    payload: SubmitReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewResultOut:
    vocab = db.scalar(
        select(UserVocab).where(
            UserVocab.id == vocab_id,
            UserVocab.user_id == current_user.id,
        )
    )
    if not vocab:
        raise HTTPException(status_code=404, detail="Vocabulary card not found.")

    now = datetime.now(timezone.utc)
    new_card_dict, next_due, new_state, is_lapse = apply_review(
        vocab.fsrs_card,
        payload.rating,
        fallback_due=vocab.due_at,
        now=now,
    )

    vocab.fsrs_card = new_card_dict
    vocab.due_at = next_due
    vocab.state = new_state
    vocab.reps += 1
    if is_lapse:
        vocab.lapses += 1

    db.add(
        ReviewLog(
            user_id=current_user.id,
            user_vocab_id=vocab.id,
            rating=payload.rating,
            reviewed_at=now,
        )
    )
    db.commit()
    db.refresh(vocab)

    return ReviewResultOut(
        vocab=VocabOut.model_validate(vocab),
        next_interval=format_interval(next_due - now),
    )


@router.get("/stats", response_model=ReviewStatsOut)
def get_review_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewStatsOut:
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_vocab = (
        db.scalar(
            select(func.count())
            .select_from(UserVocab)
            .where(UserVocab.user_id == current_user.id)
        )
        or 0
    )
    due_now = (
        db.scalar(
            select(func.count())
            .select_from(UserVocab)
            .where(UserVocab.user_id == current_user.id, UserVocab.due_at <= now)
        )
        or 0
    )
    reviewed_today = (
        db.scalar(
            select(func.count())
            .select_from(ReviewLog)
            .where(
                ReviewLog.user_id == current_user.id,
                ReviewLog.reviewed_at >= start_of_day,
            )
        )
        or 0
    )
    new_count = (
        db.scalar(
            select(func.count())
            .select_from(UserVocab)
            .where(UserVocab.user_id == current_user.id, UserVocab.state == "new")
        )
        or 0
    )
    learning_count = (
        db.scalar(
            select(func.count())
            .select_from(UserVocab)
            .where(
                UserVocab.user_id == current_user.id,
                UserVocab.state.in_(["learning", "relearning"]),
            )
        )
        or 0
    )
    review_count = (
        db.scalar(
            select(func.count())
            .select_from(UserVocab)
            .where(UserVocab.user_id == current_user.id, UserVocab.state == "review")
        )
        or 0
    )

    return ReviewStatsOut(
        total_vocab=total_vocab,
        due_now=due_now,
        reviewed_today=reviewed_today,
        new_count=new_count,
        learning_count=learning_count,
        review_count=review_count,
    )
