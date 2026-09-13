"""Add versioned check-in details.

Revision ID: 20260913_0004
Revises: 20260913_0003
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260913_0004"
down_revision: str | None = "20260913_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("daily_check_ins", sa.Column("question_set_version", sa.String(32), server_default="2026-09-13", nullable=False))
    op.create_table(
        "check_in_naps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("check_in_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.CheckConstraint("position >= 1", name="ck_check_in_naps_positive_position"),
        sa.CheckConstraint("duration_minutes > 0 AND duration_minutes <= 1440", name="ck_check_in_naps_duration"),
        sa.ForeignKeyConstraint(["check_in_id"], ["daily_check_ins.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("check_in_id", "position", name="uq_check_in_naps_position"),
    )
    op.create_index("ix_check_in_naps_check_in_id", "check_in_naps", ["check_in_id"])
    op.create_table(
        "check_in_responsibilities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("check_in_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.CheckConstraint("position >= 1", name="ck_check_in_responsibilities_positive_position"),
        sa.CheckConstraint("length(trim(description)) > 0", name="ck_check_in_responsibilities_description"),
        sa.ForeignKeyConstraint(["check_in_id"], ["daily_check_ins.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("check_in_id", "position", name="uq_check_in_responsibilities_position"),
    )
    op.create_index("ix_check_in_responsibilities_check_in_id", "check_in_responsibilities", ["check_in_id"])


def downgrade() -> None:
    op.drop_index("ix_check_in_responsibilities_check_in_id", table_name="check_in_responsibilities")
    op.drop_table("check_in_responsibilities")
    op.drop_index("ix_check_in_naps_check_in_id", table_name="check_in_naps")
    op.drop_table("check_in_naps")
    op.drop_column("daily_check_ins", "question_set_version")
