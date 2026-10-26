import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TimelineEntry } from "@multica/core/types";
import { isDeletedComment } from "@multica/core/issues/comment-deletion";

export const CHAT_FOLLOW_DISTANCE = 80;
const atBottom = (el: HTMLElement) => el.scrollHeight - el.clientHeight - el.scrollTop <= CHAT_FOLLOW_DISTANCE;
const orderKey = (entry: TimelineEntry) => `${entry.created_at}:${entry.id}`;

export function useIssueChatScroll({ enabled, scope, entries, container, suspended, ready = true }: {
  enabled: boolean;
  ready?: boolean;
  scope: string;
  entries: readonly TimelineEntry[];
  container: HTMLElement | null;
  suspended: boolean;
}) {
  const following = useRef(false);
  const paused = useRef(false);
  const initialization = useRef(0);
  const snapshot = useRef<{ scope: string; seen: Set<string>; latest: string } | null>(null);
  const [unread, setUnread] = useState<Set<string>>(() => new Set());
  const pause = useCallback(() => { initialization.current += 1; paused.current = true; following.current = false; }, []);
  useLayoutEffect(() => {
    const generation = ++initialization.current;
    following.current = false;
    paused.current = true;
    setUnread(new Set());
    if (!ready || !enabled) return;
    // Mode restoration and the virtualizer initialize before following can resume.
    let frame = 0;
    let attempts = 0;
    let stableFrames = 0;
    let lastHeight = -1;
    let lastTop = -1;
    const initialize = () => {
      if (generation !== initialization.current) return;
      const height = container?.scrollHeight ?? 0;
      const top = container?.scrollTop ?? 0;
      stableFrames = height === lastHeight && top === lastTop ? stableFrames + 1 : 0;
      lastHeight = height; lastTop = top;
      if (++attempts < 30 && (attempts < 15 || stableFrames < 2)) {
        frame = requestAnimationFrame(initialize);
        return;
      }
      paused.current = false;
      following.current = !!container && atBottom(container);
    };
    frame = requestAnimationFrame(initialize);
    return () => cancelAnimationFrame(frame);
  }, [scope, enabled, container, ready]);

  useEffect(() => {
    if (container && enabled && ready && !suspended && !paused.current) following.current = atBottom(container);
  }, [container, enabled, ready, suspended]);

  useEffect(() => {
    if (!container || !enabled || !ready) return;
    let userScrolling = false;
    let intentTimer: ReturnType<typeof setTimeout> | undefined;
    const markIntent = () => {
      userScrolling = true;
      if (intentTimer) clearTimeout(intentTimer);
      intentTimer = setTimeout(() => { userScrolling = false; }, 150);
    };
    const onWheel = (event: WheelEvent) => {
      markIntent();
      if (event.deltaY < 0) { following.current = false; paused.current = false; }
    };
    const onScroll = () => {
      const nearBottom = atBottom(container);
      // Virtualized height corrections also emit scroll events. Only user
      // intent may stop an established follow; otherwise async rows strand it.
      if (userScrolling) {
        following.current = nearBottom;
        if (!suspended) paused.current = false;
      } else if (nearBottom && !paused.current && !suspended) following.current = true;
      if (nearBottom) setUnread((old) => old.size ? new Set() : old);
    };
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchmove", markIntent, { passive: true });
    container.addEventListener("pointerdown", markIntent, { passive: true });
    container.addEventListener("keydown", markIntent);
    container.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      if (following.current && !paused.current && !suspended) container.scrollTop = container.scrollHeight;
    });
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchmove", markIntent);
      container.removeEventListener("pointerdown", markIntent);
      container.removeEventListener("keydown", markIntent);
      if (intentTimer) clearTimeout(intentTimer);
      observer.disconnect();
    };
  }, [container, enabled, suspended, ready]);

  useEffect(() => {
    if (!ready) return;
    const comments = entries.filter((entry) => entry.type === "comment" && !isDeletedComment(entry));
    const previous = snapshot.current;
    const seen = previous?.scope === scope ? new Set(previous.seen) : new Set<string>();
    const latest = comments.reduce((key, entry) => orderKey(entry) > key ? orderKey(entry) : key, previous?.scope === scope ? previous.latest : "");
    const incoming = previous?.scope === scope ? comments.filter((entry) => !seen.has(entry.id) && orderKey(entry) > previous.latest) : [];
    comments.forEach((entry) => seen.add(entry.id));
    snapshot.current = { scope, seen, latest };
    if (!enabled || !incoming.length || !container) return;
    if (following.current && !paused.current && !suspended) {
      const frame = requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
      return () => cancelAnimationFrame(frame);
    }
    setUnread((old) => new Set([...old, ...incoming.map((entry) => entry.id)]));
    return undefined;
  }, [entries, scope, enabled, container, suspended, ready]);

  const goToLatest = useCallback(() => {
    if (!container) return;
    paused.current = false;
    following.current = true;
    setUnread(new Set());
    container.scrollTop = container.scrollHeight;
  }, [container]);
  return { count: unread.size, pause, goToLatest };
}
