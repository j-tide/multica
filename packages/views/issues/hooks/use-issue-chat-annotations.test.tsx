import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TimelineEntry } from "@multica/core/types";
import { useCommentDraftStore } from "@multica/core/issues/stores";
import { toast } from "sonner";
import { renderWithI18n } from "../../test/i18n";
import { useCommentAnnotations } from "../components/use-comment-annotations";
import { useIssueChatAnnotations } from "./use-issue-chat-annotations";
import { IssueChatComment } from "../components/issue-chat-comment";
import { ReplyAnnotations } from "../components/reply-annotations";

vi.mock("@multica/core/workspace/hooks", () => ({ useActorName: () => ({ getActorName: () => "Author" }) }));
vi.mock("../components/comment-card", () => ({
  CommentRow: ({ entry }: { entry: TimelineEntry }) => <div data-comment-content={entry.id}>{entry.content}</div>,
  ReplyToQuote: () => null,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const key = "reply:issue:root";
const source: TimelineEntry = { id: "source", type: "comment", actor_type: "member", actor_id: "user", created_at: "2026-01-01T00:00:00Z" };
const note = { id: "note", sourceCommentId: source.id, sourceActorName: "Author", quote: "Original", start: 0, prefix: "", suffix: " text", note: "Review this" };
let frames: FrameRequestCallback[];

function SourceRow({ ownerKey = key, text = "Original text" }: { ownerKey?: `reply:${string}:${string}`; text?: string }) {
  const owner = useCommentAnnotations({ draftKey: ownerKey, sources: [{ id: source.id, name: "Author" }], enabled: true });
  return <div ref={owner.cardRef} {...owner.captureProps}><div data-comment-content={source.id}>{text}</div>{owner.popup}</div>;
}
function Harness({ ownerKey = key, text = "Original text", deferred = false }: { ownerKey?: `reply:${string}:${string}`; text?: string; deferred?: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(!deferred);
  const chat = useIssueChatAnnotations({ issueId: "issue", enabled: true, timeline: [source], container, onJump: () => setMounted(true) });
  return <><div ref={setContainer}>{mounted && <SourceRow ownerKey={ownerKey} text={text} />}</div>
    <button onClick={() => chat.edit(key, "note")}>Edit annotation</button></>;
}
beforeEach(() => {
  frames = [];
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1024 });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 768 });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 600, 400));
  Range.prototype.getBoundingClientRect = vi.fn(() => new DOMRect(10, 10, 120, 20));
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  useCommentDraftStore.setState({ drafts: { [key]: { content: "reply", attachments: [], annotations: [note], updatedAt: Date.now() } } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); useCommentDraftStore.setState({ drafts: {} }); });
function flushFrame() { act(() => { const pending = frames; frames = []; pending.forEach((callback) => callback(0)); }); }

it.each([false, true])("edits a valid annotation through its real source owner (source initially offscreen: %s)", async (deferred) => {
  renderWithI18n(<Harness deferred={deferred} />);
  fireEvent.click(screen.getByText("Edit annotation"));
  flushFrame();
  const input = await screen.findByRole("textbox", { name: "Comment" });
  expect(input).toHaveValue("Review this");
  fireEvent.change(input, { target: { value: "Updated review" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(useCommentDraftStore.getState().getAnnotations(key)[0]?.note).toBe("Updated review"));
  expect(toast.error).not.toHaveBeenCalled();
});

it.each([{ ownerKey: "reply:issue:other" as const }, { text: "Replaced source" }])("rejects a mismatched owner or changed source: %j", (props) => {
  renderWithI18n(<Harness {...props} />);
  fireEvent.click(screen.getByText("Edit annotation"));
  flushFrame();
  expect(toast.error).toHaveBeenCalledOnce();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(useCommentDraftStore.getState().getAnnotations(key)[0]?.note).toBe("Review this");
});

function ChatFixture({ deferred = false }: { deferred?: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(!deferred);
  const annotations = useCommentDraftStore((state) => state.getAnnotations(key));
  const root = { ...source, id: "root" };
  const entry = { ...source, parent_id: root.id, content: "Original text" };
  const chat = useIssueChatAnnotations({ issueId: "issue", enabled: true, timeline: [entry], container, onJump: () => setMounted(true) });
  return <>
    <div ref={setContainer}>{mounted && <IssueChatComment issueId="issue" root={root} entry={entry} replies={[entry]} currentUserId="user"
      onReply={async () => false} onEdit={async () => {}} onDelete={async () => {}} onToggleReaction={() => {}} />}</div>
    <section aria-label="Other message reply"><ReplyAnnotations draftKey={key} annotations={annotations} disabled={false}
      onEditAnnotation={(id) => chat.edit(key, id)} /></section>
    <button onClick={() => setMounted(false)}>Unmount source row</button>
    <button onClick={() => setMounted(true)}>Mount source row</button>

  </>;
}
function markers() {
  return [...document.querySelectorAll<HTMLButtonElement>(`[data-reply-annotation-overlay="${key}"] button`)]
    .filter((button) => button.textContent === "1");
}
async function editFromOtherReply() {
  fireEvent.click(within(screen.getByRole("region", { name: "Other message reply" })).getByRole("button", { name: "1 annotation" }));
  const dialog = await screen.findByRole("dialog", { name: "1 annotation" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Edit annotation 1" }));
  flushFrame();
  return screen.findByRole("textbox", { name: "Comment" });
}

it.each([false, true])("keeps one real row marker and editor across the cross-row entry (initially offscreen: %s)", async (deferred) => {
  renderWithI18n(<ChatFixture deferred={deferred} />);
  const input = await editFromOtherReply();
  expect(markers()).toHaveLength(1);
  expect(screen.getAllByRole("textbox", { name: "Comment" })).toHaveLength(1);
  fireEvent.change(input, { target: { value: "New note from cross-row entry" } });
  fireEvent.click(markers()[0]!);
  expect(screen.getAllByRole("textbox", { name: "Comment" })).toEqual([input]);
  expect(input).toHaveValue("New note from cross-row entry");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(useCommentDraftStore.getState().getAnnotations(key)[0]?.note).toBe("New note from cross-row entry");
  expect(markers()).toHaveLength(1);
  fireEvent.click(markers()[0]!);
  const reopened = await screen.findByRole("textbox", { name: "Comment" });
  expect(reopened).toHaveValue("New note from cross-row entry");
  fireEvent.change(reopened, { target: { value: "Newest saved note" } });
  fireEvent.keyDown(reopened, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(useCommentDraftStore.getState().getAnnotations(key)[0]?.note).toBe("Newest saved note");
  expect(toast.error).not.toHaveBeenCalled();
});

it("reopens saved content through the real row after unmount without reviving stale editing state", async () => {
  renderWithI18n(<ChatFixture />);
  fireEvent.click(markers()[0]!);
  const original = await screen.findByRole("textbox", { name: "Comment" });
  fireEvent.change(original, { target: { value: "Saved from actual row popup" } });
  fireEvent.keyDown(original, { key: "Enter" });
  fireEvent.click(screen.getByText("Unmount source row"));
  expect(markers()).toHaveLength(0);
  const input = await editFromOtherReply();
  expect(markers()).toHaveLength(1);
  expect(screen.getAllByRole("textbox", { name: "Comment" })).toHaveLength(1);
  expect(input).toHaveValue("Saved from actual row popup");
  fireEvent.change(input, { target: { value: "Saved after remount" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(original, { key: "Enter" });
  expect(useCommentDraftStore.getState().getAnnotations(key)[0]?.note).toBe("Saved after remount");
  expect(useCommentDraftStore.getState().drafts[key]?.content).toBe("reply");
});
