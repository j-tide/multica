"use client";

import { ChevronDown, List, MessagesSquare } from "lucide-react";
import type { IssueDetailView } from "@multica/core/issues/stores";
import { Button } from "@multica/ui/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@multica/ui/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { useT } from "../../i18n";

export function IssueDetailViewMenu({ view, onChange }: { view: IssueDetailView; onChange: (view: IssueDetailView) => void }) {
  const { t } = useT("issues");
  const label = view === "chat" ? t(($) => $.detail.view.chat) : t(($) => $.detail.view.activity);
  const tooltip = t(($) => $.detail.view.switch_tooltip, { current: label,
    next: view === "chat" ? t(($) => $.detail.view.activity) : t(($) => $.detail.view.chat) });
  return <DropdownMenu>
    <Tooltip>
      <TooltipTrigger render={<DropdownMenuTrigger render={<Button size="sm" variant={view === "chat" ? "brandSubtle" : "ghost"} className="w-7 px-0 @min-[640px]/issue-detail:w-auto @min-[640px]/issue-detail:px-2" aria-label={label} />}>
        {view === "chat" ? <MessagesSquare /> : <List />}
        <span className="hidden @min-[640px]/issue-detail:inline">{label}</span>
        <ChevronDown className="hidden @min-[640px]/issue-detail:inline" />
      </DropdownMenuTrigger>} />
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup value={view} onValueChange={(value) => onChange(value === "chat" ? "chat" : "activity")}>
        <DropdownMenuRadioItem value="activity" className={view === "activity" ? "bg-accent" : undefined}><List />{t(($) => $.detail.view.activity)}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="chat" className={view === "chat" ? "bg-accent" : undefined}><MessagesSquare />{t(($) => $.detail.view.chat)}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
