"""Add users, user_vocab, review_logs tables and documents.user_id.

Revision ID: 0003_users_vocab_srs
Revises: 0002_ingestion_status
Create Date: 2026-11-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_users_vocab_srs"
down_revision: Union[str, None] = "0002_ingestion_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.add_column("documents", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_foreign_key(
        "fk_documents_user_id",
        "documents",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_table(
        "user_vocab",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("word", sa.String(length=64), nullable=False),
        sa.Column("pinyin", sa.String(length=255), nullable=False),
        sa.Column("meaning", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_document_id", sa.Integer(), nullable=True),
        sa.Column("state", sa.String(length=32), nullable=False, server_default="new"),
        sa.Column("reps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lapses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "due_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "fsrs_card",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "word", name="uq_user_vocab_user_word"),
    )
    op.create_index("ix_user_vocab_user_id", "user_vocab", ["user_id"])
    op.create_index("ix_user_vocab_user_due", "user_vocab", ["user_id", "due_at"])

    op.create_table(
        "review_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_vocab_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_vocab_id"], ["user_vocab.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_review_logs_user_id", "review_logs", ["user_id"])
    op.create_index("ix_review_logs_user_vocab_id", "review_logs", ["user_vocab_id"])
    op.create_index("ix_review_logs_reviewed_at", "review_logs", ["reviewed_at"])


def downgrade() -> None:
    op.drop_index("ix_review_logs_reviewed_at", table_name="review_logs")
    op.drop_index("ix_review_logs_user_vocab_id", table_name="review_logs")
    op.drop_index("ix_review_logs_user_id", table_name="review_logs")
    op.drop_table("review_logs")

    op.drop_index("ix_user_vocab_user_due", table_name="user_vocab")
    op.drop_index("ix_user_vocab_user_id", table_name="user_vocab")
    op.drop_table("user_vocab")

    op.drop_constraint("fk_documents_user_id", "documents", type_="foreignkey")
    op.drop_index("ix_documents_user_id", table_name="documents")
    op.drop_column("documents", "user_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
