import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { defaultStorage } from "../../platform/storage";

export type IssueDetailView = "activity" | "chat";

interface IssueDetailViewState {
  view: IssueDetailView;
  setView: (view: IssueDetailView) => void;
}

export const useIssueDetailViewStore = create<IssueDetailViewState>()(
  persist(
    (set) => ({ view: "activity", setView: (view) => set({ view }) }),
    {
      name: "multica_issue_detail_view",
      storage: createJSONStorage(() => defaultStorage),
      partialize: ({ view }) => ({ view }),
      merge: (persisted, current) => ({
        ...current,
        view: persisted && typeof persisted === "object" && "view" in persisted && persisted.view === "chat"
          ? "chat" : "activity",
      }),
    },
  ),
);
