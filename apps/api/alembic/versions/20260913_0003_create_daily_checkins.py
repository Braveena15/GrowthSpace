"""Create daily check-in tables.

Revision ID: 20260913_0003
Revises: 20260910_0002
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "20260913_0003"
down_revision: str | None = "20260910_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    op.create_table("daily_check_ins", sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("local_date", sa.Date(), nullable=False), sa.Column("status", sa.String(16), server_default="draft", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("submitted_at", sa.DateTime(timezone=True)), sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("user_id", "local_date", name="uq_daily_check_ins_user_date"))
    op.create_index("ix_daily_check_ins_user_date", "daily_check_ins", ["user_id", "local_date"])
    op.create_table("check_in_answers", sa.Column("id", sa.Integer(), nullable=False), sa.Column("check_in_id", sa.Integer(), nullable=False), sa.Column("question_key", sa.String(16), nullable=False), sa.Column("numeric_value", sa.Float()), sa.Column("choice_value", sa.String(32)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.CheckConstraint("(numeric_value IS NOT NULL AND choice_value IS NULL) OR (numeric_value IS NULL AND choice_value IS NOT NULL)", name="ck_check_in_answers_one_value"), sa.ForeignKeyConstraint(["check_in_id"], ["daily_check_ins.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("check_in_id", "question_key", name="uq_check_in_answers_key"))
    op.create_index("ix_check_in_answers_check_in_id", "check_in_answers", ["check_in_id"])
    op.create_table("check_in_category_notes", sa.Column("id", sa.Integer(), nullable=False), sa.Column("check_in_id", sa.Integer(), nullable=False), sa.Column("category", sa.String(100), nullable=False), sa.Column("note", sa.String(2000), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.ForeignKeyConstraint(["check_in_id"], ["daily_check_ins.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("check_in_id", "category", name="uq_check_in_notes_category"))

def downgrade() -> None:
    op.drop_table("check_in_category_notes"); op.drop_index("ix_check_in_answers_check_in_id", table_name="check_in_answers"); op.drop_table("check_in_answers"); op.drop_index("ix_daily_check_ins_user_date", table_name="daily_check_ins"); op.drop_table("daily_check_ins")
