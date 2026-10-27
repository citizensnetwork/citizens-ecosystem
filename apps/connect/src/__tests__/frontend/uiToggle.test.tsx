/**
 * The shared Toggle (`UI.Toggle` in `src/frontend/app/ui.jsx`, issue #183): a switch a screen reader can use.
 * Mounted with the real React in jsdom. What this pins down: role="switch" with aria-checked that follows the state, a name
 * taken from its own visible label and a description from its hint, click, Space and Enter all flip it (it stays a button), a
 * disabled one ignores presses and says so, and the focus ring and the 44 px row are on the element.
 */
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type ToggleProps = { checked: boolean; onChange: (v: boolean) => void; label?: string; desc?: string; disabled?: boolean };
let Toggle: React.ComponentType<ToggleProps>;

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  function Icon() {
    return null;
  }
  w.Icon = Icon;
  const src = readFileSync(join(process.cwd(), "src/frontend/app/ui.jsx"), "utf8");
  new Function("window", "React", "document", src)(window, React, document);
  Toggle = (window as unknown as { UI: { Toggle: React.ComponentType<ToggleProps> } }).UI.Toggle;
});
beforeEach(() => cleanup());

describe("UI.Toggle is a switch", () => {
  it("has role=switch, and aria-checked follows the state", () => {
    const { rerender } = render(<Toggle checked={false} onChange={() => {}} label="Public profile" />);
    expect(screen.getByRole("switch", { name: "Public profile" }).getAttribute("aria-checked")).toBe("false");
    rerender(<Toggle checked onChange={() => {}} label="Public profile" />);
    expect(screen.getByRole("switch", { name: "Public profile" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is named by its visible label and described by its hint", () => {
    render(<Toggle checked={false} onChange={() => {}} label="Notify me" desc="A short email, once a day." />);
    const sw = screen.getByRole("switch");
    const labelId = sw.getAttribute("aria-labelledby") as string;
    const descId = sw.getAttribute("aria-describedby") as string;
    expect(document.getElementById(labelId)?.textContent).toBe("Notify me");
    expect(document.getElementById(descId)?.textContent).toBe("A short email, once a day.");
    expect(screen.getByRole("switch", { name: "Notify me" })).toBe(sw);
  });

  it("two switches on one screen get different ids", () => {
    render(
      <>
        <Toggle checked={false} onChange={() => {}} label="One" />
        <Toggle checked onChange={() => {}} label="Two" />
      </>,
    );
    const ids = screen.getAllByRole("switch").map((s) => s.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
  });

  it("a switch with no hint carries no aria-describedby, and one with no label no aria-labelledby", () => {
    render(<Toggle checked={false} onChange={() => {}} label="Only a label" />);
    expect(screen.getByRole("switch").hasAttribute("aria-describedby")).toBe(false);
    cleanup();
    render(<Toggle checked={false} onChange={() => {}} />);
    expect(screen.getByRole("switch").hasAttribute("aria-labelledby")).toBe(false);
  });

  it("is a real button, so Space and Enter work: a press asks for the opposite state", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Go" />);
    const sw = screen.getByRole("switch");
    expect(sw.tagName).toBe("BUTTON");
    expect(sw.getAttribute("type")).toBe("button");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("disabled is aria-disabled, dimmed, still focusable, and ignores presses", () => {
    const onChange = vi.fn();
    render(<Toggle checked disabled onChange={onChange} label="Locked" />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-disabled")).toBe("true");
    expect(sw.className).toContain("opacity-60");
    sw.focus();
    expect(document.activeElement).toBe(sw);
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("an ordinary one is not aria-disabled, has a focus ring and a 44 px row", () => {
    render(<Toggle checked={false} onChange={() => {}} label="Free" />);
    const sw = screen.getByRole("switch");
    expect(sw.hasAttribute("aria-disabled")).toBe(false);
    expect(sw.className).toContain("min-h-[44px]");
    expect(sw.className).toContain("focus-visible:outline-gold-dark");
    expect(sw.className).not.toContain("opacity-60");
  });

  it("on and off differ by the knob, not only the colour", () => {
    const { container, rerender } = render(<Toggle checked={false} onChange={() => {}} label="Knob" />);
    const knob = () => container.querySelector("button > span > span") as HTMLElement;
    expect(knob().style.transform).toBe("none");
    rerender(<Toggle checked onChange={() => {}} label="Knob" />);
    expect(knob().style.transform).toBe("translateX(20px)");
  });
});
