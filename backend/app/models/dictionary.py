from sqlalchemy import Boolean, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DictionaryEntry(Base):
    __tablename__ = "dictionary_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    simplified: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    traditional: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    pinyin_num: Mapped[str] = mapped_column(String(255), nullable=False)
    pinyin_marks: Mapped[str] = mapped_column(String(255), nullable=False)
    definitions: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    is_proper_noun: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("ix_dictionary_entries_simplified_proper", "simplified", "is_proper_noun"),
    )
