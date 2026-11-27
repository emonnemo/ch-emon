"""Initial schema: dictionary_entries, documents, document_sections.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dictionary_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("simplified", sa.String(length=64), nullable=False),
        sa.Column("traditional", sa.String(length=64), nullable=False),
        sa.Column("pinyin_num", sa.String(length=255), nullable=False),
        sa.Column("pinyin_marks", sa.String(length=255), nullable=False),
        sa.Column("definitions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_proper_noun", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dictionary_entries_simplified", "dictionary_entries", ["simplified"])
    op.create_index("ix_dictionary_entries_traditional", "dictionary_entries", ["traditional"])
    op.create_index(
        "ix_dictionary_entries_simplified_proper",
        "dictionary_entries",
        ["simplified", "is_proper_noun"],
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="text"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ready"),
        sa.Column("total_chars", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("section_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_section_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "document_sections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("section_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "section_index", name="uq_document_section_index"),
    )
    op.create_index("ix_document_sections_document_id", "document_sections", ["document_id"])


def downgrade() -> None:
    op.drop_index("ix_document_sections_document_id", table_name="document_sections")
    op.drop_table("document_sections")
    op.drop_table("documents")
    op.drop_index("ix_dictionary_entries_simplified_proper", table_name="dictionary_entries")
    op.drop_index("ix_dictionary_entries_traditional", table_name="dictionary_entries")
    op.drop_index("ix_dictionary_entries_simplified", table_name="dictionary_entries")
    op.drop_table("dictionary_entries")
