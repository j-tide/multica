import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TimelineEntry } from "@multica/core/types";
import { useCommentDraftStore, type CommentDraftKey } from "@multica/core/issues/stores";
import { isDeletedComment } from "@multica/core/issues/comment-deletion";
import { useT } from "../../i18n";
import { editCommentAnnotation } from "../components/use-comment-annotations";

/** Mount an annotation source before handing its edit to the owning message controller. */
export function useIssueChatAnnotations({ issueId, enabled, timeline, container, onJump }: {
  issueId: string;
  enabled: boolean;
  timeline: readonly TimelineEntry[];
  container: HTMLDivElement | null;
  onJump: (commentId: string) => void;
}) {
  const { t } = useT("issues");
  const [request, setRequest] = useState<{ key: CommentDraftKey; id: string; sourceId: string } | null>(null);
  const completed = useRef<typeof request>(null);
  useEffect(() => {
    if (!request || !enabled || completed.current === request) return;
    onJump(request.sourceId);
    let frame = 0;
    let attempts = 0;
    const edit = () => {
      const source = container?.querySelector<HTMLElement>(`[data-comment-content="${request.sourceId}"]`);
      const owner = source?.closest<HTMLDivElement>("[data-annotation-thread]");
      if (owner) {
        completed.current = request;
        if (owner.dataset.annotationThread !== request.key) {
          toast.error(t(($) => $.reply.annotations.source_changed));
          return;
        }
        if (!editCommentAnnotation(owner, request.id)) toast.error(t(($) => $.reply.annotations.source_changed));
      } else if (++attempts < 60) frame = requestAnimationFrame(edit);
      else { completed.current = request; toast.error(t(($) => $.reply.annotations.source_changed)); }
    };
    frame = requestAnimationFrame(edit);
    return () => cancelAnimationFrame(frame);
  }, [request, enabled, container, onJump, t]);
  const edit = useCallback((key: CommentDraftKey, id: string) => {
    const source = useCommentDraftStore.getState().getAnnotations(key).find((entry) => entry.id === id);
    if (!key.startsWith(`reply:${issueId}:`) || !source || !timeline.some((entry) => entry.id === source.sourceCommentId && !isDeletedComment(entry))) return false;
    setRequest({ key, id, sourceId: source.sourceCommentId });
    return true;
  }, [issueId, timeline]);
  return { edit };
}
