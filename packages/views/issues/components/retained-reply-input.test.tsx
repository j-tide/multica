import { useEffect, useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetainedReplyInput, RetainedReplyInputs, useRetainedReplyInputProtection } from "./retained-reply-input";

function Editor({ send }: { send: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const locked = useRef(false);
  useRetainedReplyInputProtection(() => !!text.trim() || locked.current);
  return <><input aria-label="draft" value={text} onChange={(event) => setText(event.target.value)} />
    <button disabled={sending} onClick={async () => {
      if (locked.current) return;
      locked.current = true;
      setSending(true);
      await send();
      setText(""); setSending(false); locked.current = false;
    }}>Send</button></>;
}
function Harness({ chat, send }: { chat: boolean; send: () => Promise<void> }) {
  const editor = <RetainedReplyInput inputKey="reply:issue:root"><Editor send={send} /></RetainedReplyInput>;
  return <RetainedReplyInputs>{chat ? <section>{editor}</section> : <article>{editor}</article>}</RetainedReplyInputs>;
}

describe("retained reply input", () => {
  it("keeps the same editor DOM, draft and send lock across layout unmounts", async () => {
    let accept!: () => void;
    const send = vi.fn(() => new Promise<void>((resolve) => { accept = resolve; }));
    const view = render(<Harness chat={false} send={send} />);
    const input = screen.getByLabelText("draft");
    fireEvent.change(input, { target: { value: "Unsent reply" } });
    input.focus();
    view.rerender(<Harness chat={false} send={send} />);
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getByText("Send"));
    view.rerender(<Harness chat send={send} />);
    expect(screen.getByLabelText("draft")).toBe(input);
    expect(input).toHaveValue("Unsent reply");
    expect(screen.getByText("Send")).toBeDisabled();
    fireEvent.click(screen.getByText("Send"));
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => accept());
    expect(input).toHaveValue("");
    view.rerender(<Harness chat={false} send={send} />);
    expect(screen.getByLabelText("draft")).toBe(input);
    expect(screen.getByText("Send")).not.toBeDisabled();
  });
});


it("reclaims detached idle inputs after traversing 40 virtual rows", async () => {
  let mounted = 0;
  function Idle() { useEffect(() => { mounted++; return () => { mounted--; }; }, []); return <input aria-label="idle" />; }
  function List({ index }: { index: number }) { return <RetainedReplyInputs>
    <RetainedReplyInput key={index} inputKey={`reply:issue:${index}`}><Idle /></RetainedReplyInput>
  </RetainedReplyInputs>; }
  const view = render(<List index={0} />);
  for (let index = 1; index < 40; index++) {
    view.rerender(<List index={index} />);
    await act(async () => {});
    expect(mounted).toBe(1);
  }
  view.unmount();
  expect(mounted).toBe(0);
});
