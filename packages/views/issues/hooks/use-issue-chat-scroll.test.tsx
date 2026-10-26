import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineEntry } from "@multica/core/types";
import { useIssueChatScroll } from "./use-issue-chat-scroll";

const comment = (id: string, second: number): TimelineEntry => ({ type: "comment", id, actor_id: "user", actor_type: "member", created_at: new Date(1000 * second).toISOString() });
let frames: FrameRequestCallback[] = [];
function setup(top: number) {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const container = document.createElement("div");
  Object.defineProperties(container, { clientHeight: { value: 500 }, scrollHeight: { value: 1500, configurable: true } });
  container.scrollTop = top;
  return container;
}
function flush() { act(() => { for (let index = 0; index < 32 && frames.length; index += 1) { const callbacks = frames; frames = []; callbacks.forEach((callback) => callback(0)); } }); }
afterEach(() => vi.unstubAllGlobals());

describe("chat following", () => {
  it("counts only new unique appended comments and keeps historical readers in place", () => {
    const container = setup(100);
    const base = { enabled: true, scope: "ws:issue", container, suspended: false };
    const { result, rerender } = renderHook((entries) => useIssueChatScroll({ ...base, entries }), { initialProps: [comment("a", 10)] });
    flush();
    rerender([comment("old", 1), comment("a", 10), comment("b", 20)]);
    expect(result.current.count).toBe(1);
    expect(container.scrollTop).toBe(100);
    rerender([comment("a", 10), { ...comment("b", 20), content: "edited" }]);
    expect(result.current.count).toBe(1);
    act(() => result.current.goToLatest());
    expect(result.current.count).toBe(0);
    expect(container.scrollTop).toBe(1500);
  });

  it.each([920, 1000])("follows an append at the 80px boundary: top %i", (top) => {
    const container = setup(top);
    const { result, rerender } = renderHook((entries) => useIssueChatScroll({ enabled: true, scope: "ws:issue", container, suspended: false, entries }), { initialProps: [comment("a", 10)] });
    flush();
    Object.defineProperty(container, "scrollHeight", { value: 1800 });
    rerender([comment("a", 10), comment("b", 20)]);
    flush();
    expect(container.scrollTop).toBe(1800);
    expect(result.current.count).toBe(0);
  });

  it("pauses for explicit navigation and never counts initial data or progress", () => {
    const container = setup(1000);
    const base = { enabled: true, scope: "ws:issue", container, suspended: false };
    const { result, rerender } = renderHook((entries) => useIssueChatScroll({ ...base, entries }), { initialProps: [comment("a", 10)] });
    flush();
    act(() => result.current.pause());
    rerender([comment("a", 10), { ...comment("event", 20), type: "activity" }]);
    expect(result.current.count).toBe(0);
    rerender([comment("a", 10), comment("b", 20)]);
    expect(result.current.count).toBe(1);
    expect(container.scrollTop).toBe(1000);
  });
});

it("does not count the first asynchronous timeline load as new messages", () => {
  const container = setup(100);
  const { result, rerender } = renderHook(({ ready, entries }) => useIssueChatScroll({ enabled: true, scope: "ws:load", container, suspended: false, ready, entries }),
    { initialProps: { ready: false, entries: [] as TimelineEntry[] } });
  flush();
  rerender({ ready: true, entries: [comment("history", 10)] });
  expect(result.current.count).toBe(0);
  rerender({ ready: true, entries: [comment("history", 10), comment("new", 20)] });
  expect(result.current.count).toBe(1);
});

it("keeps following through virtualizer height corrections but stops for an upward wheel", () => {
  const container = setup(1000);
  const props = { enabled: true, scope: "ws:corrections", container, suspended: false };
  const { result, rerender } = renderHook((entries) => useIssueChatScroll({ ...props, entries }), { initialProps: [comment("a", 10)] });
  flush();
  Object.defineProperty(container, "scrollHeight", { value: 1800, configurable: true });
  act(() => container.dispatchEvent(new Event("scroll")));
  rerender([comment("a", 10), comment("b", 20)]);
  flush();
  expect(result.current.count).toBe(0);
  expect(container.scrollTop).toBe(1800);
  act(() => {
    container.dispatchEvent(new WheelEvent("wheel", { deltaY: -200 }));
    container.scrollTop = 800;
    container.dispatchEvent(new Event("scroll"));
  });
  rerender([comment("a", 10), comment("b", 20), comment("c", 30)]);
  flush();
  expect(result.current.count).toBe(1);
  expect(container.scrollTop).toBe(800);
});

it("does not let delayed initialization override an explicit navigation pause", () => {
  const container = setup(1000);
  const { result, rerender } = renderHook((entries) => useIssueChatScroll({ enabled: true, scope: "ws:navigation", container, suspended: false, entries }), { initialProps: [comment("a", 10)] });
  act(() => result.current.pause());
  flush();
  rerender([comment("a", 10), comment("b", 20)]);
  flush();
  expect(result.current.count).toBe(1);
  expect(container.scrollTop).toBe(1000);
});

it.each([false, true])("re-evaluates bottom following after restoration without overriding an explicit pause: %s", (explicitPause) => {
  const container = setup(100);
  const { result, rerender } = renderHook(({ suspended, entries }) => useIssueChatScroll({
    enabled: true, scope: "ws:restore", container, suspended, entries,
  }), { initialProps: { suspended: true, entries: [comment("a", 10)] } });
  flush();
  if (explicitPause) act(() => result.current.pause());
  container.scrollTop = 1000;
  rerender({ suspended: false, entries: [comment("a", 10)] });
  Object.defineProperty(container, "scrollHeight", { value: 1800 });
  rerender({ suspended: false, entries: [comment("a", 10), comment("b", 20)] });
  flush();
  expect(result.current.count).toBe(explicitPause ? 1 : 0);
  expect(container.scrollTop).toBe(explicitPause ? 1000 : 1800);
});
