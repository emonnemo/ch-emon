from datetime import datetime, timedelta, timezone
from typing import Any

from fsrs import Card, Rating, Scheduler, State

_scheduler = Scheduler()

RATING_MAP: dict[int, Rating] = {
    1: Rating.Again,
    2: Rating.Hard,
    3: Rating.Good,
    4: Rating.Easy,
}


def card_state_label(card: Card) -> str:
    if card.last_review is None:
        return "new"
    if card.state == State.Learning:
        return "learning"
    if card.state == State.Review:
        return "review"
    if card.state == State.Relearning:
        return "relearning"
    return "learning"


def create_initial_fsrs_state(now: datetime | None = None) -> tuple[dict[str, Any], datetime, str]:
    now_utc = now or datetime.now(timezone.utc)
    card = Card(due=now_utc)
    return card.to_dict(), card.due, "new"


def load_card(card_dict: dict[str, Any] | None, fallback_due: datetime | None = None) -> Card:
    if card_dict and "due" in card_dict and "state" in card_dict:
        return Card.from_dict(card_dict)
    return Card(due=fallback_due or datetime.now(timezone.utc))


def format_interval(delta: timedelta) -> str:
    seconds = max(0, int(delta.total_seconds()))
    if seconds < 60:
        return "<1m"
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"{minutes}m"
    hours = round(seconds / 3600)
    if hours < 24:
        return f"{hours}h"
    days = round(seconds / 86400)
    if days < 30:
        return f"{days}d"
    months = round(days / 30)
    if months < 12:
        return f"{months}mo"
    years = round(days / 365, 1)
    return f"{years:g}y"


def preview_intervals(
    card_dict: dict[str, Any] | None,
    fallback_due: datetime | None = None,
    now: datetime | None = None,
) -> dict[str, str]:
    now_utc = now or datetime.now(timezone.utc)
    base_dict = load_card(card_dict, fallback_due).to_dict()
    previews: dict[str, str] = {}
    for num, rating in RATING_MAP.items():
        cloned = Card.from_dict(base_dict)
        next_card, _ = _scheduler.review_card(cloned, rating, now_utc)
        previews[str(num)] = format_interval(next_card.due - now_utc)
    return previews


def apply_review(
    card_dict: dict[str, Any] | None,
    rating_num: int,
    fallback_due: datetime | None = None,
    now: datetime | None = None,
) -> tuple[dict[str, Any], datetime, str, bool]:
    """Run FSRS on a card. Returns (new_card_dict, next_due, state_label, is_lapse)."""
    now_utc = now or datetime.now(timezone.utc)
    card = load_card(card_dict, fallback_due)
    was_review = card.state == State.Review
    rating = RATING_MAP[rating_num]
    updated_card, _ = _scheduler.review_card(card, rating, now_utc)
    is_lapse = was_review and rating == Rating.Again
    return updated_card.to_dict(), updated_card.due, card_state_label(updated_card), is_lapse
