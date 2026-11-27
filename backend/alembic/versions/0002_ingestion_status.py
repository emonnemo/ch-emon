"""Add ingestion progress_percent and error_message to documents.

Revision ID: 0002_ingestion_status
Revises: 0001_initial
Create Date: 2026-11-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_ingestion_status"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="100"),
    )
    op.add_column(
        "documents",
        sa.Column("error_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "error_message")
    op.drop_column("documents", "progress_percent")
