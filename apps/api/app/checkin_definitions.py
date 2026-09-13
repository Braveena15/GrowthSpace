"""Versioned, privacy-safe definitions for the daily check-in."""

from dataclasses import dataclass
from datetime import date


QUESTION_SET_VERSION = "2026-09-13-v2"
LEGACY_QUESTION_SET_VERSION = "2026-09-13"


@dataclass(frozen=True)
class Question:
    key: str
    category: str
    subcategory: str
    text: str
    kind: str
    required: bool = True
    minimum: int | float | None = None
    maximum: int | float | None = None
    choices: tuple[str, ...] = ()
    weekdays: tuple[int, ...] = ()
    scale_labels: tuple[str, ...] = ()


RATING_LABELS = ("Very low", "Low", "Okay", "Good", "Excellent")

QUESTIONS = (
    Question("M1", "Mental and emotional health", "Mood", "How was your overall mood today?", "rating", minimum=1, maximum=5, scale_labels=RATING_LABELS),
    Question("M2", "Mental and emotional health", "Self-belief", "How strongly did you believe you could handle today's challenges?", "rating", minimum=1, maximum=5, scale_labels=RATING_LABELS),
    Question("M3", "Mental and emotional health", "Emotional recovery", "If you felt a difficult emotion, how well did you recover?", "rating", minimum=1, maximum=5, choices=("N/A",), scale_labels=RATING_LABELS),
    Question("C1", "Character and maturity", "Values-based action", "How well did your actions match the person you want to be today?", "rating", minimum=1, maximum=5, scale_labels=RATING_LABELS),
    Question("CA1", "Career", "Focused learning or building", "How many focused minutes did you spend learning or building for your career?", "integer", minimum=0, maximum=600),
    Question("E1", "Communication", "English", "How many minutes did you speak English for practice today?", "integer", minimum=0, maximum=300),
    Question("S1", "Communication", "Sinhala", "How many minutes did you speak Sinhala for practice today?", "integer", minimum=0, maximum=300),
    Question("P1M", "Physical health", "Sleep", "How long did you sleep last night?", "duration", minimum=0, maximum=1440),
    Question("P3", "Physical health", "Daytime sleep", "Did you sleep during the day?", "choice", choices=("Yes", "No")),
    Question("P2", "Physical health", "Physical activity", "How long were you physically active today?", "duration", minimum=0, maximum=600),
    Question("SC1", "Skin and body care", "Daily care", "Did you use moisturizer today?", "choice", choices=("Yes", "No")),
    Question("SC2", "Skin and body care", "Scheduled care", "Did you complete Treatment 1 today?", "choice", choices=("Yes", "No"), weekdays=(0, 2)),
    Question("SC3", "Skin and body care", "Scheduled care", "Did you complete Treatment 2 today?", "choice", choices=("Yes", "No"), weekdays=(1, 3)),
    Question("D1", "Discipline and digital wellbeing", "Meditation", "How long did you meditate today?", "duration", minimum=0, maximum=300),
    Question("D2", "Discipline and digital wellbeing", "Non-essential phone use", "How much non-essential phone use did you have today?", "duration", minimum=0, maximum=1440),
    Question("I1", "Independence and finances", "Independent responsibility", "Did you complete at least one important responsibility without unnecessary help today?", "choice", choices=("Yes", "No", "N/A")),
    Question("F1", "Independence and finances", "Spending awareness", "Did you record all your spending today?", "choice", choices=("Yes", "No", "No spending")),
)

# P1 stays known only so previously stored hour-based answers keep their meaning.
LEGACY_QUESTIONS = (
    Question("P1", "Physical health", "Sleep", "How many hours did you sleep last night?", "number", minimum=0, maximum=24),
)

QUESTION_BY_KEY = {question.key: question for question in (*QUESTIONS, *LEGACY_QUESTIONS)}
CATEGORY_ORDER = tuple(dict.fromkeys(question.category for question in QUESTIONS))


def questions_for_date(local_date: date) -> tuple[Question, ...]:
    """Return questions scheduled for the supplied user's local calendar date."""
    return tuple(
        question
        for question in QUESTIONS
        if not question.weekdays or local_date.weekday() in question.weekdays
    )
