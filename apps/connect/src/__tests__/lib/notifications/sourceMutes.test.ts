import { describe, expect, it } from "vitest";
import {
  isSourceMuted,
  normaliseSourceMutes,
  validateSourceMutes,
} from "@/lib/notifications/sourceMutes";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const PLACE_ID = "44444444-4444-4444-8444-444444444444";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("source notification mutes", () => {
  it("normalises valid source mutes and removes duplicates", () => {
    expect(
      normaliseSourceMutes([
        { type: "event", id: EVENT_ID },
        { type: "event", id: EVENT_ID },
        { type: "bogus", id: EVENT_ID },
        { type: "place", id: "bad" },
      ]),
    ).toEqual([{ type: "event", id: EVENT_ID }]);
  });

  it("validates full replacement payloads strictly", () => {
    expect(validateSourceMutes([{ type: "org", id: ORG_ID }])).toEqual([
      { type: "org", id: ORG_ID },
    ]);
    expect(validateSourceMutes([{ type: "org", id: "not-a-uuid" }])).toBeNull();
    expect(validateSourceMutes("nope")).toBeNull();
  });

  it("event broadcasts only respect event mutes", () => {
    const mutes = [
      { type: "org", id: ORG_ID },
      { type: "event", id: EVENT_ID },
    ];

    expect(isSourceMuted(mutes, "event", EVENT_ID, ORG_ID)).toBe(true);
    expect(isSourceMuted([{ type: "org", id: ORG_ID }], "event", EVENT_ID, ORG_ID)).toBe(false);
  });

  it("place broadcasts respect place and contributor mutes", () => {
    expect(isSourceMuted([{ type: "place", id: PLACE_ID }], "place", PLACE_ID, ORG_ID)).toBe(true);
    expect(isSourceMuted([{ type: "org", id: ORG_ID }], "place", PLACE_ID, ORG_ID)).toBe(true);
    expect(isSourceMuted([{ type: "event", id: EVENT_ID }], "place", PLACE_ID, ORG_ID)).toBe(false);
  });
});
