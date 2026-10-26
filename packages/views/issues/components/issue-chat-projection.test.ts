// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentTask, TimelineEntry } from "@multica/core/types";
import { buildCommentRunView } from "./comment-runs";
import { buildIssueChatProjection } from "./issue-chat-projection";

const comment = (id: string, minute: number, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({
  type: "comment", id, actor_type: "member", actor_id: "member", content: id,
  created_at: new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString(), ...extra,
});

describe("issue chat projection", () => {
  it("interleaves replies across threads by timestamp and id without duplicating records", () => {
    const rows = [comment("b", 2), comment("a", 0), comment("d", 3, { parent_id: "a" }), comment("c", 2, { parent_id: "b" })];
    expect(buildIssueChatProjection([...rows, rows[0]!], []).map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("groups only adjacent messages with the same identity, thread, context and date within five minutes", () => {
    const rows = [comment("a", 0), comment("b", 1, { parent_id: "a" }), comment("c", 6, { parent_id: "a" }),
      comment("d", 12, { parent_id: "a" }), comment("e", 13, { parent_id: "a", actor_type: "agent" }),
      comment("f", 14, { parent_id: "a", resolved_at: "2026-01-01" }), comment("g", 15, { parent_id: "a" })];
    expect(buildIssueChatProjection(rows, []).map((row) => row.kind === "comment" && row.compact)).toEqual([false, false, true, false, false, false, false]);
  });

  it("breaks groups across dates, system events and run slots, and keeps deleted parents out of display", () => {
    const rows = [comment("a", 0, { deleted_at: "2026-01-01" }), comment("b", 1, { parent_id: "a" }),
      comment("event", 2, { type: "activity", action: "status_changed" }), comment("c", 3, { parent_id: "a" }),
      comment("d", 4, { parent_id: "a", created_at: "2026-01-02T12:04:00Z" })];
    const result = buildIssueChatProjection(rows, []);
    expect(result.map((row) => row.id)).toEqual(["b", "event", "c", "d"]);
    expect(result.every((row) => row.kind !== "comment" || !row.compact)).toBe(true);
  });

  it("reuses projected parents and gives a published output exactly one slot", () => {
    const task = { id: "run", kind: "direct", status: "completed", trigger_comment_id: "input", created_at: "2026-01-01T12:00:00Z", completed_at: "2026-01-01T12:02:00Z" } as AgentTask;
    const rows = [comment("input", 0), comment("output", 2, { actor_type: "agent", actor_id: "agent", source_task_id: "run" })];
    const view = buildCommentRunView([task], rows);
    const runs = [...view.runs.values()].flat().concat(view.standaloneRuns);
    const result = buildIssueChatProjection(view.timeline, runs.concat(runs));
    expect(result.map((row) => row.id)).toEqual(["input", "output"]);
    expect(result[1]).toMatchObject({ kind: "run", entry: { parent_id: "input" } });
  });

  it("keeps a failed run's notice in its run slot and preserves resolved messages", () => {
    const task = { id: "run", status: "failed", trigger_comment_id: "a", created_at: "2026-01-01T12:00:00Z" } as AgentTask;
    const rows = [comment("a", 0, { resolved_at: "2026-01-01" }), comment("failure", 2, { actor_type: "agent", comment_type: "system", source_task_id: "run" })];
    const view = buildCommentRunView([task], rows);
    expect(buildIssueChatProjection(view.timeline, [...view.runs.values()].flat())).toMatchObject([
      { kind: "comment", id: "a" }, { kind: "run", id: "failure", run: { hasReply: true } },
    ]);
  });
  it("does not group system comments into an author's ordinary messages", () => {
    const rows = [comment("root", 0), comment("a", 1, { parent_id: "root" }),
      comment("system", 2, { parent_id: "root", comment_type: "system" }), comment("b", 3, { parent_id: "root" })];
    expect(buildIssueChatProjection(rows, []).every((row) => row.kind !== "comment" || !row.compact)).toBe(true);
  });

});
