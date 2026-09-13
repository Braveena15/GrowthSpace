from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DailyNoteAnalysis(Base):
    __tablename__ = "daily_note_analyses"
    __table_args__ = (
        UniqueConstraint("check_in_id", name="uq_daily_note_analyses_check_in"),
        UniqueConstraint("user_id", "local_date", name="uq_daily_note_analyses_user_date"),
        CheckConstraint("status IN ('draft', 'accepted', 'rejected')", name="ck_daily_note_analyses_status"),
        Index("ix_daily_note_analyses_user_date", "user_id", "local_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    check_in_id: Mapped[int] = mapped_column(ForeignKey("daily_check_ins.id", ondelete="CASCADE"), nullable=False)
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    positive_actions: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    challenges: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    possible_improvements: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    themes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    reflection_question: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", server_default="draft")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False)
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
