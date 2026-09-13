import { describe, expect, it } from "vitest";

import { formatDuration, formatLocalDateKey } from "./checkins";

describe("check-in utilities", () => {
  it("uses local calendar fields instead of a UTC ISO date", () => {
    const localBoundary = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 14,
      toISOString: () => "2026-09-13T18:35:00.000Z",
    } as Date;
    expect(formatLocalDateKey(localBoundary)).toBe("2026-09-14");
  });

  it("formats canonical minute totals", () => {
    expect(formatDuration(0)).toBe("0 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(135)).toBe("2 hours 15 minutes");
  });
});
