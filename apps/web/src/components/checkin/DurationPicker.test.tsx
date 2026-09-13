import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { DurationPicker } from "./DurationPicker";

function Harness() {
  const [value, setValue] = useState<number | null>(null);
  return <DurationPicker id="duration" label="Test duration" value={value} maxMinutes={600} onChange={setValue} />;
}

describe("DurationPicker", () => {
  it("distinguishes unanswered, zero, hours only, minutes only, and both", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const hours = screen.getByLabelText("Test duration hours");
    const minutes = screen.getByLabelText("Test duration minutes");
    expect(screen.getByText("Not answered")).toBeInTheDocument();

    await user.selectOptions(hours, "0");
    expect(screen.getByText("0 minutes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear duration" }));
    await user.selectOptions(minutes, "25");
    expect(screen.getByText("25 minutes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear duration" }));
    await user.selectOptions(hours, "2");
    expect(screen.getByText("2 hours")).toBeInTheDocument();
    await user.selectOptions(minutes, "15");
    expect(screen.getByText("2 hours 15 minutes")).toBeInTheDocument();
  });

  it("returns to a completely unanswered state when cleared", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText("Test duration hours"), "1");
    await user.click(screen.getByRole("button", { name: "Clear duration" }));
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(screen.getByLabelText("Test duration hours")).toHaveValue("");
    expect(screen.getByLabelText("Test duration minutes")).toHaveValue("");
  });
});
