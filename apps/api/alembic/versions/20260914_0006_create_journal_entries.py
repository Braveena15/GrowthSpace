"""Create private journal entries."""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "20260914_0006"
down_revision: str | None = "20260914_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    op.create_table("journal_entries", sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("title", sa.String(length=200), nullable=True), sa.Column("content", sa.Text(), nullable=False), sa.Column("entry_date", sa.Date(), nullable=False), sa.Column("entry_time", sa.Time(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_journal_entries_user_date_time", "journal_entries", ["user_id", "entry_date", "entry_time"])

def downgrade() -> None:
    op.drop_index("ix_journal_entries_user_date_time", table_name="journal_entries")
    op.drop_table("journal_entries")
