"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CurrentIssueRenderContextProvider, useCurrentIssueRenderContext, type CurrentIssueRenderContextValue } from "../current-issue-render-context";

type Protection = () => boolean;
type Entry = {
  host: HTMLDivElement;
  children: ReactNode;
  issue: CurrentIssueRenderContextValue | null;
  connected: boolean;
  protected: Protection;
  report: (check: Protection) => void;
};
type Registry = {
  connect: (key: string, children: ReactNode, issue: Entry["issue"]) => HTMLDivElement;
  update: (key: string, children: ReactNode, issue: Entry["issue"]) => void;
  disconnect: (key: string) => void;
};
const ReplyInputContext = createContext<Registry | null>(null);
const ProtectionContext = createContext<((check: Protection) => void) | null>(null);

/** Read live editor/session state, including text not yet flushed to the draft store. */
export function useRetainedReplyInputProtection(check: Protection) {
  const report = useContext(ProtectionContext);
  const latest = useRef(check);
  latest.current = check;
  useLayoutEffect(() => { report?.(() => latest.current()); }, [report, check]);
}

/** Retain busy reply sessions across layout changes; reclaim detached idle inputs. */
export function RetainedReplyInputs({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Map<string, Entry>>(() => new Map());
  const cache = useRef(new Map<string, Entry>());
  const alive = useRef(true);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const registry = useMemo<Registry>(() => {
    const publish = () => { if (alive.current) setEntries(new Map(cache.current)); };
    const sweep = (key: string, entry: Entry) => {
      // A mode switch detaches and reconnects the same key in one commit.
      queueMicrotask(() => {
        if (!alive.current || cache.current.get(key) !== entry || entry.connected || entry.protected()) return;
        cache.current.delete(key);
        publish();
      });
    };
    const update = (key: string, content: ReactNode, issue: Entry["issue"]) => {
      const entry = cache.current.get(key);
      if (entry && (entry.children !== content || entry.issue !== issue)) {
        entry.children = content; entry.issue = issue;
        publish();
      }
    };
    return {
      connect: (key, content, issue) => {
        let entry = cache.current.get(key);
        if (!entry) {
          const created: Entry = { host: document.createElement("div"), children: content, issue,
            connected: true, protected: () => false,
            report: (check) => { created.protected = check; if (!created.connected) sweep(key, created); },
          };
          entry = created;
          cache.current.set(key, entry);
          publish();
        } else { entry.connected = true; update(key, content, issue); }
        return entry.host;
      },
      update,
      disconnect: (key) => {
        const entry = cache.current.get(key);
        if (!entry) return;
        entry.connected = false;
        entry.host.remove();
        sweep(key, entry);
      },
    };
  }, []);
  return <ReplyInputContext value={registry}>
    {children}
    {[...entries].map(([key, entry]) => createPortal(
      <CurrentIssueRenderContextProvider value={entry.issue}>
        <ProtectionContext value={entry.report}>{entry.children}</ProtectionContext>
      </CurrentIssueRenderContextProvider>, entry.host, key))}
  </ReplyInputContext>;
}

export function RetainedReplyInput({ inputKey, children }: { inputKey: string; children: ReactNode }) {
  const registry = useContext(ReplyInputContext);
  const issue = useCurrentIssueRenderContext();
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef({ children, issue });
  contentRef.current = { children, issue };
  useLayoutEffect(() => {
    if (!registry || !ref.current) return;
    const host = registry.connect(inputKey, contentRef.current.children, contentRef.current.issue);
    ref.current.appendChild(host);
    return () => registry.disconnect(inputKey);
  }, [registry, inputKey]);
  useLayoutEffect(() => { registry?.update(inputKey, children, issue); }, [registry, inputKey, children, issue]);
  return <div ref={ref}>{!registry && children}</div>;
}
