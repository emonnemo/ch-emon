from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.document import Document
from app.models.user import User
from app.models.vocab import UserVocab
from app.schemas.vocab import (
    CreateVocabRequest,
    UpdateVocabRequest,
    VocabOut,
    VocabWordRef,
)
from app.services.srs import create_initial_fsrs_state
from app.services.translator import translator

router = APIRouter(prefix="/api/vocab", tags=["vocab"])


@router.get("", response_model=list[VocabOut])
def list_vocab(
    q: str | None = Query(default=None, max_length=100),
    due_only: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserVocab]:
    stmt = select(UserVocab).where(UserVocab.user_id == current_user.id)
    if due_only:
        stmt = stmt.where(UserVocab.due_at <= datetime.now(timezone.utc))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                UserVocab.word.ilike(pattern),
                UserVocab.pinyin.ilike(pattern),
                UserVocab.meaning.ilike(pattern),
                UserVocab.notes.ilike(pattern),
                UserVocab.example_sentence.ilike(pattern),
            )
        )
    stmt = stmt.order_by(UserVocab.created_at.desc(), UserVocab.id.desc())
    return list(db.scalars(stmt).all())


@router.get("/words", response_model=list[VocabWordRef])
def list_saved_word_refs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[VocabWordRef]:
    rows = db.execute(
        select(UserVocab.id, UserVocab.word).where(UserVocab.user_id == current_user.id)
    ).all()
    return [VocabWordRef(id=row[0], word=row[1]) for row in rows]


@router.post("", response_model=VocabOut, status_code=status.HTTP_201_CREATED)
def create_vocab(
    payload: CreateVocabRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserVocab:
    word = payload.word.strip()
    pinyin = payload.pinyin.strip()
    meaning = payload.meaning.strip()
    if not word or not pinyin or not meaning:
        raise HTTPException(status_code=400, detail="Word, pinyin, and meaning are required.")

    existing = db.scalar(
        select(UserVocab).where(
            UserVocab.user_id == current_user.id,
            UserVocab.word == word,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="This word is already in your dictionary.")

    source_doc_id = payload.source_document_id
    if source_doc_id is not None:
        doc = db.scalar(
            select(Document).where(
                Document.id == source_doc_id,
                Document.user_id == current_user.id,
            )
        )
        if not doc:
            source_doc_id = None

    example_sentence = (
        payload.example_sentence.strip()
        if payload.example_sentence and payload.example_sentence.strip()
        else None
    )
    example_translation = (
        payload.example_translation.strip()
        if payload.example_translation and payload.example_translation.strip()
        else None
    )
    if example_sentence and not example_translation:
        try:
            example_translation, _ = translator.translate(db, example_sentence)
        except Exception:
            pass

    card_dict, due_at, state_label = create_initial_fsrs_state()
    vocab = UserVocab(
        user_id=current_user.id,
        word=word,
        pinyin=pinyin,
        meaning=meaning,
        notes=payload.notes.strip() if payload.notes and payload.notes.strip() else None,
        example_sentence=example_sentence,
        example_translation=example_translation,
        source_document_id=source_doc_id,
        state=state_label,
        reps=0,
        lapses=0,
        due_at=due_at,
        fsrs_card=card_dict,
    )
    db.add(vocab)
    db.commit()
    db.refresh(vocab)
    return vocab


@router.patch("/{vocab_id}", response_model=VocabOut)
def update_vocab(
    vocab_id: int,
    payload: UpdateVocabRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserVocab:
    vocab = db.scalar(
        select(UserVocab).where(
            UserVocab.id == vocab_id,
            UserVocab.user_id == current_user.id,
        )
    )
    if not vocab:
        raise HTTPException(status_code=404, detail="Vocabulary word not found.")

    if payload.pinyin is not None:
        cleaned_py = payload.pinyin.strip()
        if cleaned_py:
            vocab.pinyin = cleaned_py
    if payload.meaning is not None:
        cleaned_meaning = payload.meaning.strip()
        if cleaned_meaning:
            vocab.meaning = cleaned_meaning
    if payload.notes is not None:
        vocab.notes = payload.notes.strip() or None
    if payload.example_sentence is not None:
        vocab.example_sentence = payload.example_sentence.strip() or None
    if payload.example_translation is not None:
        vocab.example_translation = payload.example_translation.strip() or None

    db.commit()
    db.refresh(vocab)
    return vocab


@router.delete("/{vocab_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_vocab(
    vocab_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    vocab = db.scalar(
        select(UserVocab).where(
            UserVocab.id == vocab_id,
            UserVocab.user_id == current_user.id,
        )
    )
    if not vocab:
        raise HTTPException(status_code=404, detail="Vocabulary word not found.")
    db.delete(vocab)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
