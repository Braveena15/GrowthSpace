import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { RatingScale } from "./RatingScale";

const labels = ["Very low", "Low", "Okay", "Good", "Excellent"];

function Harness() {
  const [value, setValue] = useState<number | "N/A" | null>(null);
  return <RatingScale id="mood" label="Mood today" labels={labels} value={value} onChange={setValue} />;
}

describe("RatingScale", () => {
  it("starts empty and allows selecting, changing, and clearing", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getAllByRole("radio").every((option) => option.getAttribute("aria-checked") === "false")).toBe(true);

    await user.click(screen.getByRole("radio", { name: "2: Low" }));
    expect(screen.getByRole("radio", { name: "2: Low" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "5: Excellent" }));
    expect(screen.getByRole("radio", { name: "5: Excellent" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getAllByRole("radio").every((option) => option.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("supports arrow, Home, and End keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole("radio", { name: "1: Very low" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "2: Low" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "5: Excellent" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
  });
});
