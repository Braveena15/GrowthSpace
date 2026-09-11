import { describe, expect, it } from "vitest";

import { formatDateKey, getWeekDays, startOfWeekMonday } from "./planner";

describe("planner date utilities", () => {
  it.each([
    ["2026-09-14T12:00:00", "2026-09-14"],
    ["2026-09-16T12:00:00", "2026-09-14"],
    ["2026-09-20T12:00:00", "2026-09-14"],
  ])("calculates a Monday-to-Sunday week for %s", (input, expectedMonday) => {
    const weekStart = startOfWeekMonday(new Date(input));
    const weekDays = getWeekDays(weekStart).map(formatDateKey);

    expect(formatDateKey(weekStart)).toBe(expectedMonday);
    expect(weekDays).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });
});
