// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("../../platform/storage", () => ({
  defaultStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
}));

import { useIssueDetailViewStore } from "./issue-detail-view-store";

beforeEach(() => {
  storage.clear();
  useIssueDetailViewStore.setState({ view: "activity" });
});

describe("issue detail view preference", () => {
  it("restores the saved choice on rehydration", async () => {
    useIssueDetailViewStore.getState().setView("chat");
    const saved = storage.get("multica_issue_detail_view")!;
    expect(JSON.parse(saved).state).toEqual({ view: "chat" });
    useIssueDetailViewStore.getState().setView("activity");
    storage.set("multica_issue_detail_view", saved);
    await useIssueDetailViewStore.persist.rehydrate();
    expect(useIssueDetailViewStore.getState().view).toBe("chat");
  });

  it.each([null, {}, { view: "unknown" }])("defaults to activity for missing or invalid preferences: %j", async (state) => {
    useIssueDetailViewStore.getState().setView("chat");
    storage.set("multica_issue_detail_view", JSON.stringify({ state, version: 0 }));
    await useIssueDetailViewStore.persist.rehydrate();
    expect(useIssueDetailViewStore.getState().view).toBe("activity");
  });
});
