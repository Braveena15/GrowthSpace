from datetime import date
import calendar


def add_calendar_months(anchor: date, months: int) -> date:
    """Calendar anniversary with end-of-month clamping."""
    index = anchor.year * 12 + anchor.month - 1 + months
    year, month_index = divmod(index, 12)
    month = month_index + 1
    return date(year, month, min(anchor.day, calendar.monthrange(year, month)[1]))


def cycle_bounds(anchor: date, offset: int) -> tuple[date, date]:
    start = add_calendar_months(anchor, offset)
    return start, add_calendar_months(anchor, offset + 1).fromordinal(add_calendar_months(anchor, offset + 1).toordinal() - 1)


def cycle_for_date(anchor: date, value: date) -> tuple[int, date, date]:
    offset = (value.year - anchor.year) * 12 + value.month - anchor.month
    while offset > 0 and add_calendar_months(anchor, offset) > value: offset -= 1
    while add_calendar_months(anchor, offset + 1) <= value: offset += 1
    start, end = cycle_bounds(anchor, offset)
    return offset, start, end


def is_cycle_boundary(anchor: date, value: date) -> bool:
    return cycle_for_date(anchor, value)[1] == value
