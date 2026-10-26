// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Link from "next/link";
import { useRestoredScrollOffset } from "@multica/views/platform";
import { WebScrollRestorationProvider } from "./scroll-restoration";

function ScrollProbe({ containerKey }: { containerKey: string }) {
  const restored = useRestoredScrollOffset(containerKey);
  return <output data-testid="restored">{restored ?? "none"}</output>;
}

/** Dispatch a real scroll event from a marked container element. */
function scrollContainer(el: HTMLElement, top: number) {
  Object.defineProperty(el, "scrollTop", { configurable: true, value: top });
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    value: 2000,
  });
  el.dispatchEvent(new Event("scroll", { bubbles: false }));
}

describe("WebScrollRestorationProvider", () => {
  it.each([4230, 0])("captures final position %i before internal navigation even while restore writes are shielded", (top) => {
    const key = `navigation-final-position-${top}`;
    const view = render(<WebScrollRestorationProvider>
      <div data-tab-scroll-root={key} data-testid="container" />
      <ScrollProbe containerKey={key} />
      <Link href="/other-issue" prefetch={false} onClick={(event) => event.preventDefault()}>Other issue</Link>
    </WebScrollRestorationProvider>);
    scrollContainer(screen.getByTestId("container"), 356);
    view.rerender(<WebScrollRestorationProvider>
      <div data-tab-scroll-root={key} data-testid="container" />
      <ScrollProbe containerKey={key} />
      <Link href="/other-issue" prefetch={false} onClick={(event) => event.preventDefault()}>Other issue</Link>
    </WebScrollRestorationProvider>);
    expect(screen.getByTestId("restored")).toHaveTextContent("356");
    scrollContainer(screen.getByTestId("container"), top);
    fireEvent.click(screen.getByRole("link", { name: "Other issue" }));
    view.rerender(<WebScrollRestorationProvider><ScrollProbe containerKey={key} /></WebScrollRestorationProvider>);
    expect(screen.getByTestId("restored")).toHaveTextContent(String(top));
  });

  it.each([
    { name: "external", href: "https://other.example/issue", click: {}, target: "", download: false },
    { name: "hash", href: "#comment", click: {}, target: "", download: false },
    { name: "modified", href: "/other-issue", click: { ctrlKey: true }, target: "", download: false },
    { name: "new tab", href: "/other-issue", click: {}, target: "_blank", download: false },
    { name: "download", href: "/other-issue", click: {}, target: "", download: true },
    { name: "right click", href: "/other-issue", click: { button: 2 }, target: "", download: false },
  ])("keeps the restore shield for $name links", ({ name, href, click, target, download }) => {
    const key = `navigation-ignored-${name}`;
    const ui = <WebScrollRestorationProvider>
      <div data-tab-scroll-root={key} data-testid="container" />
      <ScrollProbe containerKey={key} />
      <Link href={href} prefetch={false} target={target} download={download} onClick={(event) => event.preventDefault()}>Link</Link>
    </WebScrollRestorationProvider>;
    const view = render(ui);
    scrollContainer(screen.getByTestId("container"), 356);
    view.rerender(<WebScrollRestorationProvider>
      <div data-tab-scroll-root={key} data-testid="container" />
      <ScrollProbe containerKey={key} />
      <Link href={href} prefetch={false} target={target} download={download} onClick={(event) => event.preventDefault()}>Link</Link>
    </WebScrollRestorationProvider>);
    scrollContainer(screen.getByTestId("container"), 4230);
    const link = screen.getByRole("link", { name: "Link" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, click);
    view.rerender(<WebScrollRestorationProvider><ScrollProbe containerKey={key} /></WebScrollRestorationProvider>);
    expect(screen.getByTestId("restored")).toHaveTextContent("356");
  });

  it("serves a captured container offset back for the same pathname", () => {
    const view = render(
      <WebScrollRestorationProvider>
        <div data-tab-scroll-root="main" data-testid="container" />
        <ScrollProbe containerKey="main" />
      </WebScrollRestorationProvider>,
    );

    scrollContainer(screen.getByTestId("container"), 480);

    // Remount — the same pull the view performs after navigating back.
    view.rerender(
      <WebScrollRestorationProvider>
        <ScrollProbe containerKey="main" />
      </WebScrollRestorationProvider>,
    );
    expect(screen.getByTestId("restored").textContent).toBe("480");
  });

  it("serves an authoritative zero when the container scrolls back to the top", () => {
    const view = render(
      <WebScrollRestorationProvider>
        <div data-tab-scroll-root="cleared" data-testid="container" />
        <ScrollProbe containerKey="cleared" />
      </WebScrollRestorationProvider>,
    );

    scrollContainer(screen.getByTestId("container"), 480);
    scrollContainer(screen.getByTestId("container"), 0);

    view.rerender(
      <WebScrollRestorationProvider>
        <ScrollProbe containerKey="cleared" />
      </WebScrollRestorationProvider>,
    );
    expect(screen.getByTestId("restored").textContent).toBe("0");
  });

  it("shields a just-served memento from the clamped scroll events a restore produces", () => {
    const view = render(
      <WebScrollRestorationProvider>
        <div data-tab-scroll-root="shielded" data-testid="container" />
        <ScrollProbe containerKey="shielded" />
      </WebScrollRestorationProvider>,
    );

    scrollContainer(screen.getByTestId("container"), 480);

    // Remount serves 480 (and arms the write shield) …
    view.rerender(
      <WebScrollRestorationProvider>
        <div data-tab-scroll-root="shielded" data-testid="container" />
        <ScrollProbe containerKey="shielded" />
      </WebScrollRestorationProvider>,
    );
    expect(screen.getByTestId("restored").textContent).toBe("480");

    // … so the browser clamping the restore assignment (content not yet at
    // full height → scrollTop lands at 100) must not overwrite the memento.
    scrollContainer(screen.getByTestId("container"), 100);
    view.rerender(
      <WebScrollRestorationProvider>
        <ScrollProbe containerKey="shielded" />
      </WebScrollRestorationProvider>,
    );
    expect(screen.getByTestId("restored").textContent).toBe("480");
  });

  it("ignores scrolls from unmarked elements", () => {
    render(
      <WebScrollRestorationProvider>
        <div data-testid="plain" />
        <ScrollProbe containerKey="plain" />
      </WebScrollRestorationProvider>,
    );

    scrollContainer(screen.getByTestId("plain"), 480);
    expect(screen.getByTestId("restored").textContent).toBe("none");
  });
});
