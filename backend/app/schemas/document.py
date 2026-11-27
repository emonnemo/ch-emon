from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DictionaryEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    simplified: str
    traditional: str
    pinyin_num: str
    pinyin_marks: str
    definitions: list[str]
    is_proper_noun: bool


class CreateTextDocumentRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    text: str = Field(..., min_length=1, max_length=500_000)


class SectionSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    section_index: int
    title: str | None
    char_count: int


class DocumentSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_type: str
    status: str
    progress_percent: int
    error_message: str | None
    total_chars: int
    section_count: int
    last_section_index: int
    created_at: datetime
    updated_at: datetime


class UpdateDocumentRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class DocumentDetailOut(DocumentSummaryOut):
    sections: list[SectionSummaryOut]


class DocumentSectionOut(BaseModel):
    document_id: int
    document_title: str
    section_index: int
    section_count: int
    title: str | None
    char_count: int
    tokens: list[list[dict[str, Any]]]
    dictionary: dict[str, DictionaryEntryOut]


class UpdateProgressRequest(BaseModel):
    last_section_index: int = Field(..., ge=0)
