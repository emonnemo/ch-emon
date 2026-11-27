from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CreateVocabRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=64)
    pinyin: str = Field(..., min_length=1, max_length=255)
    meaning: str = Field(..., min_length=1, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    example_sentence: str | None = Field(default=None, max_length=1000)
    example_translation: str | None = Field(default=None, max_length=1000)
    source_document_id: int | None = None


class UpdateVocabRequest(BaseModel):
    pinyin: str | None = Field(default=None, min_length=1, max_length=255)
    meaning: str | None = Field(default=None, min_length=1, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    example_sentence: str | None = Field(default=None, max_length=1000)
    example_translation: str | None = Field(default=None, max_length=1000)


class VocabOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    word: str
    pinyin: str
    meaning: str
    notes: str | None
    example_sentence: str | None
    example_translation: str | None
    source_document_id: int | None
    state: str
    reps: int
    lapses: int
    due_at: datetime
    created_at: datetime
    updated_at: datetime


class VocabWordRef(BaseModel):
    id: int
    word: str


class DueCardOut(VocabOut):
    interval_previews: dict[str, str]


class SubmitReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=4)


class ReviewResultOut(BaseModel):
    vocab: VocabOut
    next_interval: str


class ReviewStatsOut(BaseModel):
    total_vocab: int
    due_now: int
    reviewed_today: int
    new_count: int
    learning_count: int
    review_count: int
