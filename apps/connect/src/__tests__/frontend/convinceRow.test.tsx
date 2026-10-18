/**
 * Convince, the screen (`src/frontend/app/convince.jsx`, FEAT-04): the "Friends considering" row and the note under Consider.
 *
 * The real component, mounted with the real React in jsdom, against stand-ins for the signed-in Supabase client, `authedFetch`
 * and the toast (the frontend has no import graph, so the two files are evaluated the same way the browser loads them).
 * What this pins down: the row is silent until there is someone to show, a nudge goes out once and is undone cleanly, every
 * status reaches the person as a calm sentence, a refusal never says why, and a late answer for an old event cannot overwrite
 * the screen. The database side is proved by docs/audit/probes/friends_considering.probe.sql; the whole page by e2e/convince.spec.ts.
 */
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = { id: string; full_name: string; avatar_url: string | null; nudged: boolean };
const EV = "11111111-1111-4111-8111-111111111111";
const EV2 = "44444444-4444-4444-8444-444444444444";
const ANN = "22222222-2222-4222-8222-222222222222";
const BEA = "33333333-3333-4333-8333-333333333333";
const ME = "55555555-5555-4555-8555-555555555555";

type Win = Record<string, unknown> & { FriendsConsidering: React.ComponentType<Record<string, unknown>>; ConsiderNote: React.ComponentType<Record<string, unknown>> };
let W: Win;

function load(file: string) {
  const src = readFileSync(join(process.cwd(), "src/frontend/app", file), "utf8");
  new Function("window", "React", "document", src)(window, React, document);
}
beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  w.DATA = { isPastEvent: () => false };
  function Icon({ name }: { name: string }) {
    return React.createElement("i", { "data-icon": name });
  }
  function Avatar({ name }: { name: string }) {
    return React.createElement("span", { "data-avatar": name });
  }
  w.Icon = Icon;
  w.UI = { Avatar };
  load("convince-lib.jsx");
  load("convince.jsx");
  W = window as unknown as Win;
});
beforeEach(() => cleanup());

const row = (id: string, full_name: string, nudged = false): Row => ({ id, full_name, avatar_url: null, nudged });
function fakeSb(...answers: Row[][]) {
  const rpc = vi.fn();
  answers.forEach((a) => rpc.mockResolvedValueOnce({ data: a, error: null }));
  rpc.mockResolvedValue({ data: answers[answers.length - 1] ?? [], error: null });
  return { rpc };
}
const fetchOk = (status: number) => vi.fn().mockResolvedValue({ status, ok: status < 400, json: () => Promise.resolve({}) });

function mount(over: Record<string, unknown> = {}) {
  const toast = vi.fn();
  const authedFetch = fetchOk(201);
  const props = { sb: fakeSb([row(BEA, "Bea Probe"), row(ANN, "Ann Probe")]), eventId: EV, eventTitle: "Night of Worship", me: ME, myName: "Sam", authedFetch, toast, ...over };
  const view = render(React.createElement(W.FriendsConsidering, props));
  return { ...view, toast, props };
}
const rowFor = (id: string) => document.querySelector(`[data-convince-friend="${id}"]`) as HTMLElement | null;
const sendBtn = (id: string) => document.querySelector(`[data-convince-send="${id}"]`) as HTMLButtonElement;
const undoBtn = (id: string) => document.querySelector(`[data-convince-undo="${id}"]`) as HTMLButtonElement;

describe("when there is nothing to show, the row is silent", () => {
  it("renders nothing for an empty list, a failed read, a missing client or a missing person", async () => {
    for (const over of [
      { sb: fakeSb([]) },
      { sb: { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } }) } },
      { sb: null },
      { me: "" },
    ]) {
      const { container, unmount } = mount(over);
      await act(async () => { await Promise.resolve(); });
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});

describe("the row", () => {
  it("lists the friends in the database's order with a Nudge each and the line they will read", async () => {
    mount({ sb: fakeSb([row(ANN, "Ann Probe"), row(BEA, "Bea Probe")]) });
    await screen.findByText("Friends considering");
    expect([...document.querySelectorAll("[data-convince-name]")].map((n) => n.textContent)).toEqual(["Ann Probe", "Bea Probe"]);
    expect(sendBtn(ANN).getAttribute("aria-label")).toBe("Nudge Ann Probe to go to Night of Worship");
    expect(sendBtn(ANN).textContent).toBe("Nudge");
    expect(document.querySelector('[data-convince="preview"]')!.textContent).toBe("They will read: “Sam thinks you should go to Night of Worship”.");
  });
  it("a sender with no name is previewed as Someone, a friend with no name as A friend", async () => {
    mount({ myName: "", sb: fakeSb([row(ANN, "")]) });
    await screen.findByText("Friends considering");
    expect(document.querySelector('[data-convince="preview"]')!.textContent).toContain("Someone thinks you should go to Night of Worship");
    expect(rowFor(ANN)!.querySelector("[data-convince-name]")!.textContent).toBe("A friend");
  });
  it("a friend who was already nudged shows Nudged and Undo, not Nudge", async () => {
    mount({ sb: fakeSb([row(ANN, "Ann Probe", true), row(BEA, "Bea Probe")]) });
    await screen.findByText("Friends considering");
    expect(rowFor(ANN)!.getAttribute("data-state")).toBe("nudged");
    expect(sendBtn(ANN)).toBeNull();
    expect(undoBtn(ANN).getAttribute("aria-label")).toBe("Withdraw your nudge to Ann Probe");
    expect(rowFor(BEA)!.getAttribute("data-state")).toBe("idle");
  });
});

describe("sending and withdrawing", () => {
  it("a tap sends ONE POST, the row becomes Nudged, and the toast says to whom", async () => {
    const { props, toast } = mount();
    await screen.findByText("Friends considering");
    fireEvent.click(sendBtn(ANN));
    await waitFor(() => expect(rowFor(ANN)!.getAttribute("data-state")).toBe("nudged"));
    expect(props.authedFetch).toHaveBeenCalledTimes(1);
    expect(props.authedFetch).toHaveBeenCalledWith("/api/convince", { method: "POST", body: JSON.stringify({ event_id: EV, to_user_id: ANN }) });
    expect(toast).toHaveBeenCalledWith("Nudge sent to Ann Probe.", "gold");
    expect(rowFor(BEA)!.getAttribute("data-state")).toBe("idle");
  });
  it("Undo sends ONE DELETE, the row goes back to Nudge, and the toast is honest", async () => {
    const authedFetch = fetchOk(200);
    const { toast } = mount({ sb: fakeSb([row(ANN, "Ann Probe", true)]), authedFetch });
    await screen.findByText("Friends considering");
    fireEvent.click(undoBtn(ANN));
    await waitFor(() => expect(rowFor(ANN)!.getAttribute("data-state")).toBe("idle"));
    expect(authedFetch).toHaveBeenCalledTimes(1);
    expect(authedFetch).toHaveBeenCalledWith("/api/convince", { method: "DELETE", body: JSON.stringify({ event_id: EV, to_user_id: ANN }) });
    expect(toast).toHaveBeenCalledWith("Nudge withdrawn. Anything they already saw stays in their notifications.", "gold");
    expect(sendBtn(ANN)).not.toBeNull();
  });
  it("409 (already nudged) is shown as Nudged with its own sentence", async () => {
    const { toast } = mount({ authedFetch: fetchOk(409) });
    await screen.findByText("Friends considering");
    fireEvent.click(sendBtn(BEA));
    await waitFor(() => expect(rowFor(BEA)!.getAttribute("data-state")).toBe("nudged"));
    expect(toast).toHaveBeenCalledWith("You have already nudged Bea Probe about this event.", "gold");
  });
  it("403 is one neutral sentence, and the list is read again without saying why", async () => {
    const sb = fakeSb([row(ANN, "Ann Probe"), row(BEA, "Bea Probe")], [row(BEA, "Bea Probe")]);
    const { toast } = mount({ sb, authedFetch: fetchOk(403) });
    await screen.findByText("Friends considering");
    fireEvent.click(sendBtn(ANN));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That nudge cannot be sent right now.", "red"));
    await waitFor(() => expect(rowFor(ANN)).toBeNull());       // Ann is no longer in the refreshed list
    expect(rowFor(BEA)).not.toBeNull();
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    const said = toast.mock.calls.map((c) => String(c[0])).join(" ");
    expect(said).not.toMatch(/block|hidden|private|considering/i);
  });
  it("429 asks for a moment and leaves the button usable", async () => {
    const { toast } = mount({ authedFetch: fetchOk(429) });
    await screen.findByText("Friends considering");
    fireEvent.click(sendBtn(ANN));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That is a lot of nudges at once. Please try again in a moment.", "gold"));
    expect(rowFor(ANN)!.getAttribute("data-state")).toBe("idle");
    expect(sendBtn(ANN).disabled).toBe(false);
  });
  it("a server error is the generic sentence", async () => {
    const { toast } = mount({ authedFetch: fetchOk(500) });
    await screen.findByText("Friends considering");
    fireEvent.click(sendBtn(ANN));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Something went wrong. Please try again.", "red"));
  });
  it("while one request is in flight every button is disabled, so a double tap sends once", async () => {
    let release: (v: unknown) => void = () => {};
    const authedFetch = vi.fn().mockImplementation(() => new Promise((res) => { release = res; }));
    mount({ authedFetch });
    await screen.findByText("Friends considering");
    fireEvent.click(sendBtn(ANN));
    await waitFor(() => expect(sendBtn(BEA).disabled).toBe(true));
    expect(sendBtn(ANN).disabled).toBe(true);
    fireEvent.click(sendBtn(ANN));
    fireEvent.click(sendBtn(BEA));
    expect(authedFetch).toHaveBeenCalledTimes(1);
    await act(async () => { release({ status: 201, ok: true, json: () => Promise.resolve({}) }); });
    await waitFor(() => expect(rowFor(ANN)!.getAttribute("data-state")).toBe("nudged"));
    expect(sendBtn(BEA).disabled).toBe(false);
  });
});

describe("a late answer for an old event", () => {
  it("cannot overwrite the screen of the event the person moved to", async () => {
    const pending: Record<string, (v: unknown) => void> = {};
    const rpc = vi.fn().mockImplementation((_fn: string, args: { p_event: string }) => new Promise((res) => { pending[args.p_event] = res; }));
    const base = { sb: { rpc }, me: ME, myName: "Sam", authedFetch: fetchOk(201), toast: vi.fn() };
    const { rerender } = render(React.createElement(W.FriendsConsidering, { ...base, eventId: EV, eventTitle: "First" }));
    rerender(React.createElement(W.FriendsConsidering, { ...base, eventId: EV2, eventTitle: "Second" }));
    await act(async () => { pending[EV2]({ data: [row(BEA, "Bea Probe")], error: null }); });
    await screen.findByText("Friends considering");
    await act(async () => { pending[EV]({ data: [row(ANN, "Ann Probe")], error: null }); });
    expect(rowFor(BEA)).not.toBeNull();
    expect(rowFor(ANN)).toBeNull();
  });
});

describe("the note under Consider", () => {
  it("says friends who follow you back can see it, and the link opens Settings", () => {
    const onOpenSettings = vi.fn();
    render(React.createElement(W.ConsiderNote, { shared: true, onOpenSettings }));
    const note = document.querySelector("[data-consider-note]")!;
    expect(note.textContent).toBe("Friends you follow, who follow you back, can see you’re considering this. Change in Settings");
    fireEvent.click(document.querySelector("[data-consider-note-link]")!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
  it("is quiet once the person has switched sharing off", () => {
    const { container } = render(React.createElement(W.ConsiderNote, { shared: false, onOpenSettings: vi.fn() }));
    expect(container.innerHTML).toBe("");
  });
});
