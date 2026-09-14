"""Add durable reporting start date."""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "20260914_0007"
down_revision: str | None = "20260914_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    op.add_column("users", sa.Column("tracking_started_on", sa.Date(), nullable=True))
    # Existing users are anchored only when a persisted answer exists; empty opened drafts stay null.
    op.execute("UPDATE users SET tracking_started_on = source.first_date FROM (SELECT daily_check_ins.user_id, MIN(daily_check_ins.local_date) AS first_date FROM daily_check_ins JOIN check_in_answers ON check_in_answers.check_in_id = daily_check_ins.id GROUP BY daily_check_ins.user_id) AS source WHERE users.id = source.user_id")

def downgrade() -> None:
    op.drop_column("users", "tracking_started_on")
