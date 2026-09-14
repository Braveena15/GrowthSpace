from datetime import date

from app.services.progress_cycles import add_calendar_months, cycle_bounds, cycle_for_date


def test_calendar_anniversaries_clamp_and_cycles_are_continuous() -> None:
    anchor = date(2026, 1, 31)
    assert add_calendar_months(anchor, 1) == date(2026, 2, 28)
    assert add_calendar_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    first = cycle_bounds(anchor, 0); second = cycle_bounds(anchor, 1)
    assert first == (date(2026, 1, 31), date(2026, 2, 27))
    assert second[0] == first[1].fromordinal(first[1].toordinal() + 1)


def test_cycle_for_tracking_start_on_fourteenth() -> None:
    anchor = date(2026, 9, 14)
    assert cycle_for_date(anchor, date(2026, 9, 14))[1:] == (date(2026, 9, 14), date(2026, 10, 13))
    assert cycle_for_date(anchor, date(2026, 10, 13))[0] == 0
    assert cycle_for_date(anchor, date(2026, 10, 14))[0] == 1
