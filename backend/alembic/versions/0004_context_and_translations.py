"""Add example_sentence & example_translation to user_vocab and create translation_cache.

Revision ID: 0004_context_and_translations
Revises: 0003_users_vocab_srs
Create Date: 2026-11-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_context_and_translations"
down_revision: Union[str, None] = "0003_users_vocab_srs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_vocab", sa.Column("example_sentence", sa.Text(), nullable=True))
    op.add_column("user_vocab", sa.Column("example_translation", sa.Text(), nullable=True))

    op.create_table(
        "translation_cache",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column("engine", sa.String(length=32), nullable=False, server_default="argos-zh-en"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("text_hash", name="uq_translation_cache_text_hash"),
    )
    op.create_index("ix_translation_cache_text_hash", "translation_cache", ["text_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_translation_cache_text_hash", table_name="translation_cache")
    op.drop_table("translation_cache")
    op.drop_column("user_vocab", "example_translation")
    op.drop_column("user_vocab", "example_sentence")
