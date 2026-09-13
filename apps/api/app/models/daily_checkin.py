from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DailyCheckIn(Base):
    __tablename__ = "daily_check_ins"
    __table_args__ = (
        UniqueConstraint("user_id", "local_date", name="uq_daily_check_ins_user_date"),
        Index("ix_daily_check_ins_user_date", "user_id", "local_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    question_set_version: Mapped[str] = mapped_column(String(32), nullable=False, default="2026-09-13-v2", server_default="2026-09-13")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", server_default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CheckInAnswer(Base):
    __tablename__ = "check_in_answers"
    __table_args__ = (
        UniqueConstraint("check_in_id", "question_key", name="uq_check_in_answers_key"),
        Index("ix_check_in_answers_check_in_id", "check_in_id"),
        CheckConstraint("(numeric_value IS NOT NULL AND choice_value IS NULL) OR (numeric_value IS NULL AND choice_value IS NOT NULL)", name="ck_check_in_answers_one_value"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    check_in_id: Mapped[int] = mapped_column(ForeignKey("daily_check_ins.id", ondelete="CASCADE"), nullable=False)
    question_key: Mapped[str] = mapped_column(String(16), nullable=False)
    numeric_value: Mapped[float | None] = mapped_column(nullable=True)
    choice_value: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CheckInCategoryNote(Base):
    __tablename__ = "check_in_category_notes"
    __table_args__ = (UniqueConstraint("check_in_id", "category", name="uq_check_in_notes_category"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    check_in_id: Mapped[int] = mapped_column(ForeignKey("daily_check_ins.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str] = mapped_column(String(2000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CheckInNap(Base):
    __tablename__ = "check_in_naps"
    __table_args__ = (
        UniqueConstraint("check_in_id", "position", name="uq_check_in_naps_position"),
        CheckConstraint("position >= 1", name="ck_check_in_naps_positive_position"),
        CheckConstraint("duration_minutes > 0 AND duration_minutes <= 1440", name="ck_check_in_naps_duration"),
        Index("ix_check_in_naps_check_in_id", "check_in_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    check_in_id: Mapped[int] = mapped_column(ForeignKey("daily_check_ins.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)


class CheckInResponsibility(Base):
    __tablename__ = "check_in_responsibilities"
    __table_args__ = (
        UniqueConstraint("check_in_id", "position", name="uq_check_in_responsibilities_position"),
        CheckConstraint("position >= 1", name="ck_check_in_responsibilities_positive_position"),
        CheckConstraint("length(trim(description)) > 0", name="ck_check_in_responsibilities_description"),
        Index("ix_check_in_responsibilities_check_in_id", "check_in_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    check_in_id: Mapped[int] = mapped_column(ForeignKey("daily_check_ins.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
