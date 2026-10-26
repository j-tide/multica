import type { TimelineEntry } from "@multica/core/types";
import { isDeletedComment } from "@multica/core/issues/comment-deletion";
import { orderTimelineWithRuns, type CommentRun } from "./comment-runs";

export type IssueChatItem =
  | { kind: "comment"; id: string; entry: TimelineEntry; compact: boolean }
  | { kind: "run"; id: string; run: CommentRun; entry?: TimelineEntry }
  | { kind: "activity-group"; id: string; entries: TimelineEntry[] };

export function buildIssueChatProjection(timeline: readonly TimelineEntry[], runs: readonly CommentRun[]): IssueChatItem[] {
  const byId = new Map(timeline.map((entry) => [entry.id, entry]));
  const uniqueRuns = [...new Map(runs.map((run) => [run.task.id, run])).values()];
  const rootId = (entry: TimelineEntry) => {
    const seen = new Set<string>();
    while (entry.parent_id && byId.has(entry.parent_id) && !seen.has(entry.id)) {
      seen.add(entry.id);
      entry = byId.get(entry.parent_id)!;
    }
    return entry.id;
  };
  const items: IssueChatItem[] = [];
  for (const row of orderTimelineWithRuns([...byId.values()], uniqueRuns, byId)) {
    if ("task" in row) {
      items.push({ kind: "run", id: row.commentId ?? row.task.id, run: row,
        entry: row.hasReply && row.commentId ? byId.get(row.commentId) : undefined });
    } else if (row.type === "activity") {
      const previous = items.at(-1);
      if (previous?.kind === "activity-group") previous.entries.push(row);
      else items.push({ kind: "activity-group", id: row.id, entries: [row] });
    } else if (!isDeletedComment(row)) {
      const previous = items.at(-1);
      const prior = previous?.kind === "comment" ? previous.entry : undefined;
      const elapsed = prior ? Date.parse(row.created_at) - Date.parse(prior.created_at) : Infinity;
      const compact = !!prior && prior.comment_type !== "system" && row.comment_type !== "system"
        && row.actor_type !== "system" && prior.actor_type === row.actor_type && prior.actor_id === row.actor_id
        && rootId(prior) === rootId(row) && (prior.parent_id ?? null) === (row.parent_id ?? null)
        && new Date(prior.created_at).toDateString() === new Date(row.created_at).toDateString()
        && elapsed >= 0 && elapsed <= 5 * 60 * 1000 && !prior.resolved_at && !row.resolved_at;
      items.push({ kind: "comment", id: row.id, entry: row, compact });
    }
  }
  return items;
}
