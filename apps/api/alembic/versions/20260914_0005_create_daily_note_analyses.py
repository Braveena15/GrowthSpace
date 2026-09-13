"""Create daily note analyses.

Revision ID: 20260914_0005
Revises: 20260913_0004
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260914_0005"
down_revision: str | None = "20260913_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_note_analyses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("check_in_id", sa.Integer(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("positive_actions", sa.JSON(), nullable=False),
        sa.Column("challenges", sa.JSON(), nullable=False),
        sa.Column("possible_improvements", sa.JSON(), nullable=False),
        sa.Column("themes", sa.JSON(), nullable=False),
        sa.Column("reflection_question", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("prompt_version", sa.String(32), nullable=False),
        sa.Column("source_fingerprint", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'accepted', 'rejected')", name="ck_daily_note_analyses_status"),
        sa.ForeignKeyConstraint(["check_in_id"], ["daily_check_ins.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("check_in_id", name="uq_daily_note_analyses_check_in"),
        sa.UniqueConstraint("user_id", "local_date", name="uq_daily_note_analyses_user_date"),
    )
    op.create_index("ix_daily_note_analyses_user_date", "daily_note_analyses", ["user_id", "local_date"])


def downgrade() -> None:
    op.drop_index("ix_daily_note_analyses_user_date", table_name="daily_note_analyses")
    op.drop_table("daily_note_analyses")
