import { describe, it, expect } from "vitest";
import { getTemporalStyle, escapeHtml } from "@/lib/map/markers";

describe("getTemporalStyle", () => {
  it("returns live state when event is happening now", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 60 * 1000); // started 30 min ago
    const end = new Date(now.getTime() + 90 * 60 * 1000); // ends in 90 min

    const result = getTemporalStyle(start.toISOString(), end.toISOString());

    expect(result.isLive).toBe(true);
    expect(result.opacity).toBe(1);
    expect(result.scale).toBe(1.3);
  });

  it("returns full opacity for events within 24 hours", () => {
    const now = new Date();
    // Use an event 12 hours from now; scale depends on whether it's still "today"
    const start = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const isToday = start.toDateString() === now.toDateString();

    const result = getTemporalStyle(start.toISOString());

    expect(result.isLive).toBe(false);
    expect(result.opacity).toBe(1);
    expect(result.scale).toBe(isToday ? 1.1 : 1);
  });

  it("returns reduced opacity for events 3 days away", () => {
    const now = new Date();
    const start = new Date(now.getTime() + 3 * 86_400_000);

    const result = getTemporalStyle(start.toISOString());

    expect(result.isLive).toBe(false);
    expect(result.opacity).toBe(0.9);
    expect(result.scale).toBe(0.95);
  });

  it("returns lower opacity for events 2 weeks away", () => {
    const now = new Date();
    const start = new Date(now.getTime() + 14 * 86_400_000);

    const result = getTemporalStyle(start.toISOString());

    expect(result.isLive).toBe(false);
    expect(result.opacity).toBe(0.7);
    expect(result.scale).toBe(0.9);
  });

  it("returns further reduced opacity for events 60 days away", () => {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 86_400_000);

    const result = getTemporalStyle(start.toISOString());

    expect(result.isLive).toBe(false);
    expect(result.opacity).toBe(0.55);
    expect(result.scale).toBe(0.85);
  });

  it("returns minimum opacity for events over 90 days away", () => {
    const now = new Date();
    const start = new Date(now.getTime() + 120 * 86_400_000);

    const result = getTemporalStyle(start.toISOString());

    expect(result.isLive).toBe(false);
    expect(result.opacity).toBe(0.35);
    expect(result.scale).toBe(0.8);
  });

  it("uses 2-hour default end time when no end date provided", () => {
    const now = new Date();
    // Event started 1 hour ago — should be live with default 2h duration
    const start = new Date(now.getTime() - 60 * 60 * 1000);

    const result = getTemporalStyle(start.toISOString());

    expect(result.isLive).toBe(true);
  });

  it("treats past events symmetrically with future events", () => {
    const now = new Date();
    const pastEvent = new Date(now.getTime() - 5 * 86_400_000);
    const futureEvent = new Date(now.getTime() + 5 * 86_400_000);

    const pastResult = getTemporalStyle(pastEvent.toISOString());
    const futureResult = getTemporalStyle(futureEvent.toISOString());

    expect(pastResult.opacity).toBe(futureResult.opacity);
    expect(pastResult.scale).toBe(futureResult.scale);
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
    );
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("It's fine")).toBe("It&#39;s fine");
  });

  it("handles strings with no special characters", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });

  it("handles empty strings", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes all special characters in one input", () => {
    expect(escapeHtml(`<div class="test" data-name='a&b'>`)).toBe(
      "&lt;div class=&quot;test&quot; data-name=&#39;a&amp;b&#39;&gt;"
    );
  });
});
