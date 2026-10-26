import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { IssueDetailView } from "@multica/core/issues/stores";
import { renderWithI18n } from "../../test/i18n";
import { IssueDetailViewMenu } from "./issue-detail-view-menu";

it("exposes the current choice and switches once through the radio menu", async () => {
  const changed = vi.fn();
  function Harness() {
    const [view, setView] = useState<IssueDetailView>("activity");
    return <IssueDetailViewMenu view={view} onChange={(next) => { changed(next); setView(next); }} />;
  }
  const user = userEvent.setup();
  renderWithI18n(<Harness />);
  await user.click(screen.getByRole("button", { name: "Activity" }));
  expect(screen.getByRole("menuitemradio", { name: "Activity" })).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("menuitemradio", { name: "Group chat" }));
  expect(changed).toHaveBeenCalledExactlyOnceWith("chat");
  expect(screen.getByRole("button", { name: "Group chat" })).toBeInTheDocument();
  expect(screen.queryByRole("menu")).toBeNull();
});
