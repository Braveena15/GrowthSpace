export const VISIBLE_START_MINUTES = 6 * 60;
export const VISIBLE_END_MINUTES = 22 * 60;
export const SLOT_MINUTES = 30;

export type TimeOption = {
  value: string;
  label: string;
};

export function startOfWeekMonday(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

export function addWeeks(date: Date, amount: number): Date {
  return addDays(date, amount * 7);
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function formatDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatDayHeading(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const startLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(weekStart);
  const endLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(weekEnd);
  return `${startLabel} – ${endLabel}`;
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeValue(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}:00`;
}

export function formatTime(value: string): string {
  const totalMinutes = timeToMinutes(value);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function buildTimeOptions(): TimeOption[] {
  const options: TimeOption[] = [];
  for (
    let minutes = VISIBLE_START_MINUTES;
    minutes <= VISIBLE_END_MINUTES;
    minutes += SLOT_MINUTES
  ) {
    const value = minutesToTimeValue(minutes);
    options.push({ value, label: formatTime(value) });
  }
  return options;
}

export function isWithinWeek(dateKey: string, weekStart: Date): boolean {
  const startKey = formatDateKey(weekStart);
  const endKey = formatDateKey(addDays(weekStart, 6));
  return dateKey >= startKey && dateKey <= endKey;
}

export function isOutsideVisibleHours(startTime: string, endTime: string): boolean {
  return (
    timeToMinutes(startTime) < VISIBLE_START_MINUTES ||
    timeToMinutes(endTime) > VISIBLE_END_MINUTES
  );
}
