from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="text")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ready")
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_chars: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    section_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_section_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    sections: Mapped[list["DocumentSection"]] = relationship(
        "DocumentSection",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentSection.section_index",
    )


class DocumentSection(Base):
    __tablename__ = "document_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Stored as list of paragraphs, where each paragraph is a list of compact token dicts:
    # [{"t": "冰淇淋", "p": "bīng jī líng", "d": [59204]}, {"t": "。", "w": False}]
    tokens: Mapped[list[list[dict[str, Any]]]] = mapped_column(JSONB, nullable=False)

    document: Mapped["Document"] = relationship("Document", back_populates="sections")

    __table_args__ = (
        UniqueConstraint("document_id", "section_index", name="uq_document_section_index"),
    )
