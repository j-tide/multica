"use client";

import { useCallback } from "react";
import type { AgentTask, TimelineEntry } from "@multica/core/types";
import { isDeletedComment } from "@multica/core/issues/comment-deletion";
import { useCommentDraftStore, type CommentDraftKey } from "@multica/core/issues/stores";
import { useActorName } from "@multica/core/workspace/hooks";
import { CommentRow, ReplyToQuote, type CommentCardProps } from "./comment-card";
import { PlacedInlineCommentRun } from "./inline-comment-run";
import { ReplyInput } from "./reply-input";
import { RetainedReplyInput } from "./retained-reply-input";
import { useCommentAnnotations } from "./use-comment-annotations";
import { useT } from "../../i18n";

export function IssueChatComment({ root, parent, compact = false, onEditReplyAnnotation, ...props }: CommentCardProps & {
  root: TimelineEntry;
  parent?: TimelineEntry;
  compact?: boolean;
  onEditReplyAnnotation?: (key: CommentDraftKey, id: string) => boolean;
}) {
  const { t } = useT("issues");
  const { getActorName } = useActorName();
  const { issueId, entry, replies, runs = [], currentUserId } = props;
  const draftKey: CommentDraftKey = `reply:${issueId}:${root.id}`;
  const draft = useCommentDraftStore((s) => s.drafts[draftKey]);
  const targetId = draft?.replyTarget?.commentId ?? root.id;
  const thread = [root, ...replies];
  const targetMissing = !thread.some((row) => row.id === targetId && !isDeletedComment(row));
  const inputHostId = targetMissing ? thread.find((row) => !isDeletedComment(row))?.id : targetId;
  const open = inputHostId === entry.id && !!draft;
  const annotation = useCommentAnnotations({ draftKey,
    sources: thread.map((row) => ({ id: row.id, name: row.actor_name || getActorName(row.actor_type, row.actor_id), revision: row.revision })),
    enabled: !!currentUserId,
  });
  const steerByDefault = useCallback((task: AgentTask) => runs.some((run) => run.task.id === task.id), [runs]);
  const rowRuns = runs.filter((run) => run.hasReply && run.commentId === entry.id);
  const quote = entry.parent_id ? parent && !isDeletedComment(parent)
    ? <ReplyToQuote entry={parent} onJump={props.onJumpToComment} />
    : <span className="text-caption text-muted-foreground">{parent ? t(($) => $.detail.view.deleted_parent) : t(($) => $.detail.view.missing_parent)}</span>
    : undefined;
  return <div ref={annotation.cardRef} {...annotation.captureProps}
    className="min-w-0 break-words [overflow-wrap:anywhere] [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto">
    {annotation.popup}
    <CommentRow {...props} chat compact={compact} replyTo={quote}
      hasReplies={replies.some((reply) => reply.parent_id === entry.id)}
      isResolution={!!entry.resolved_at} isHighlighted={props.highlightedCommentId === entry.id}
      onReplyClick={currentUserId ? () => useCommentDraftStore.getState().setReplyTarget(draftKey, entry.id,
        entry.actor_name || getActorName(entry.actor_type, entry.actor_id)) : undefined}
      runHeader={rowRuns.map((run) => <PlacedInlineCommentRun key={run.task.id} run={run} presentation="header" />)}
      runMetadata={rowRuns.map((run) => <PlacedInlineCommentRun key={run.task.id} run={run} />)} />
    {open && <div className="px-4 pb-3 max-md:px-3">
      <RetainedReplyInput inputKey={draftKey}><ReplyInput issueId={issueId} parentId={targetId}
        targetMissing={targetMissing} targetLabel={draft?.replyTarget?.actorName} draftKey={draftKey}
        onResetTarget={!isDeletedComment(root) ? () => useCommentDraftStore.getState().setReplyTarget(draftKey, root.id, root.actor_name || getActorName(root.actor_type, root.actor_id)) : undefined} avatarType="member" avatarId={currentUserId ?? ""} size="sm"
        onEditAnnotation={(id) => onEditReplyAnnotation?.(draftKey, id) ?? annotation.editAnnotation(id, true)} steerByDefault={steerByDefault}
        onSubmit={(content, attachments, suppressed, steered) => targetMissing ? Promise.resolve(false) : props.onReply(targetId, content, attachments, suppressed, steered)}
        onAccepted={props.onReplyAccepted} /></RetainedReplyInput>
    </div>}
  </div>;
}
