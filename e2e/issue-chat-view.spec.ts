import { test, expect, type ElementHandle } from "@playwright/test";
import { createTestApi, loginAsDefault, waitForPageText } from "./helpers";
import type { TestApiClient } from "./fixtures";

async function sampleReadingAnchor({ containerKey, anchor, frames }: {
  containerKey: string;
  anchor: { id: string; offset: number };
  frames: number;
}) {
  const samples = [];
  for (let frame = 0; frame < frames; frame++) {
    await new Promise(requestAnimationFrame);
    const container = [...document.querySelectorAll<HTMLElement>("[data-tab-scroll-root]")]
      .find((element) => element.isConnected && element.getClientRects().length > 0
        && element.getAttribute("data-tab-scroll-root") === containerKey);
    const row = container?.querySelector<HTMLElement>(`[id="${anchor.id}"]`);
    const bounds = container?.getBoundingClientRect();
    const rowBounds = row?.getBoundingClientRect();
    samples.push({
      connected: !!container?.isConnected && !!row?.isConnected,
      visible: !!bounds && !!rowBounds && rowBounds.bottom > bounds.top && rowBounds.top < bounds.bottom
        && rowBounds.bottom > 0 && rowBounds.top < window.innerHeight,
      error: bounds && rowBounds ? rowBounds.top - bounds.top - anchor.offset : null,
    });
  }
  return samples;
}

test.describe("Issue group chat", () => {
  let api: TestApiClient;
  let issueId: string;
  let slug: string;
  let rootId: string;
  let replyId: string;
  test.beforeEach(async ({ page }) => {
    api = await createTestApi();
    const issue = await api.createIssue(`Group chat ${Date.now()}`);
    issueId = issue.id;
    const root = await api.createComment(issueId, "First message\n\n```ts\nconst value = 'a long code example';\n``` ");
    rootId = root.id;
    await api.createComment(issueId, "Second message");
    replyId = (await api.createComment(issueId, "Nested reply", root.id)).id;
    slug = await loginAsDefault(page);
    await page.goto(`/${slug}/issues/${issueId}`, { waitUntil: "domcontentloaded" });
    await waitForPageText(page, issue.title);
    await expect(page).toHaveURL(new RegExp(`/issues/${issue.identifier}$`));
    await expect(page.getByTestId("comment-composer-shell")).toBeVisible();
  });
  test.afterEach(async () => { await api?.cleanup(); });

  for (const edge of ["top", "bottom"] as const) {
    test(`finishes ${edge} boundary restoration and releases the scroll gates`, async ({ page }) => {
      test.setTimeout(90000);
      page.setDefaultTimeout(15000);
      const issue = await api.createIssue(`Boundary ${edge} ${Date.now()}`);
      issueId = issue.id;
      rootId = (await api.createComment(issueId, "Boundary thread root")).id;
      let lastId = rootId;
      for (let index = 0; index < 32; index++) {
        lastId = (await api.createComment(issueId, `Boundary reply ${index}\n\n${"Context for reading. ".repeat(6)}`, rootId)).id;
      }
      await page.goto(`/${slug}/issues/${issueId}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`/issues/${issue.identifier}$`));
      const scroller = page.locator('[data-tab-scroll-root*="main:"]');
      let release = () => {};
      let uploaded: ReturnType<typeof page.waitForResponse> | undefined;
      let originalEditor: ElementHandle<SVGElement | HTMLElement> | null = null;
      try {
        if (edge === "bottom") {
          await page.getByRole("button", { name: "Activity", exact: true }).click();
          await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
          await scroller.hover(); await page.mouse.wheel(0, 20000);
          const last = page.locator(`#comment-${lastId}`);
          await expect.poll(async () => {
            await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
            return last.count();
          }).toBe(1);
          await expect.poll(async () => {
            await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
            const row = await last.boundingBox();
            const composer = await page.locator('[data-issue-comment-composer]').boundingBox();
            return row && composer ? row.y + row.height - composer.y : Infinity;
          }).toBeLessThanOrEqual(-4);
          await last.hover();
          await last.getByRole("button", { name: "Leave a reply...", exact: true }).click();
          const shell = last.getByTestId("reply-composer-shell");
          if (await shell.count()) await shell.click();
          const editor = last.locator('.ProseMirror').first();
          await editor.fill("Protected boundary draft");
          originalEditor = await editor.elementHandle();
          const gate = new Promise<void>((resolve) => { release = resolve; });
          await page.route("**/api/upload-file", async (route) => { await gate; await route.continue(); });
          uploaded = page.waitForResponse((response) => response.url().endsWith("/api/upload-file") && response.request().method() === "POST");
          await last.locator('input[type="file"]').last().setInputFiles({ name: "boundary.txt", mimeType: "text/plain", buffer: Buffer.from("Boundary upload retained") });
          await page.getByRole("button", { name: "Group chat", exact: true }).click();
          await page.getByRole("menuitemradio", { name: "Activity", exact: true }).click();
          await scroller.hover(); await page.mouse.wheel(0, 20000);
          await expect.poll(async () => {
            await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
            return scroller.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              return [...element.querySelectorAll('[data-comment-block]')].some((row) => row.getBoundingClientRect().bottom > bounds.top && row.getBoundingClientRect().top < bounds.bottom);
            });
          }).toBe(true);
        }
        const anchor = await scroller.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const block = [...element.querySelectorAll<HTMLElement>('[data-comment-block]')]
            .find((row) => row.getBoundingClientRect().bottom > bounds.top && row.getBoundingClientRect().top < bounds.bottom);
          const row = block!.closest<HTMLElement>('[id^="comment-"]')!;
          const native = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
          let writes = 0;
          Object.defineProperty(element, "scrollTop", { configurable: true,
            get: () => native.get!.call(element) as number,
            set: (value: number) => { writes++; (element as HTMLElement & { boundaryWrites: number }).boundaryWrites = writes; native.set!.call(element, value); },
          });
          return { id: row.id, offset: row.getBoundingClientRect().top - bounds.top };
        });
        await page.getByRole("button", { name: "Activity", exact: true }).click();
        await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
        await expect(page.locator(`[id="${anchor.id}"]`)).toBeInViewport();
        await expect.poll(() => scroller.evaluate((element, currentEdge) => Math.abs(element.scrollTop - (currentEdge === "bottom" ? element.scrollHeight - element.clientHeight : 0)), edge)).toBeLessThanOrEqual(1);
        const measurement = await scroller.evaluate(async (element, { anchor, edge }) => {
          let previous = ""; let stable = 0;
          for (let frame = 0; stable < 5 && frame < 120; frame++) {
            await new Promise(requestAnimationFrame);
            const row = document.getElementById(anchor.id)!;
            const geometry = `${row.getBoundingClientRect().top}:${row.getBoundingClientRect().height}:${element.scrollTop}:${element.scrollHeight}:${element.clientHeight}`;
            stable = geometry === previous ? stable + 1 : 0; previous = geometry;
          }
          const startWrites = ((element as HTMLElement & { boundaryWrites?: number }).boundaryWrites ?? 0);
          for (let frame = 0; frame < 35; frame++) await new Promise(requestAnimationFrame);
          const row = document.getElementById(anchor.id)!;
          return { edge, stable, top: element.scrollTop, max: element.scrollHeight - element.clientHeight,
            requested: element.scrollTop + row.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset,
            idleWrites: ((element as HTMLElement & { boundaryWrites?: number }).boundaryWrites ?? 0) - startWrites };
        }, { anchor, edge });
        console.info("Boundary browser measurement", JSON.stringify(measurement));
        expect(measurement.stable).toBeGreaterThanOrEqual(5);
        expect(Math.abs(measurement.top - (edge === "bottom" ? measurement.max : 0))).toBeLessThanOrEqual(1);
        expect(measurement.idleWrites).toBe(0);
        if (edge === "bottom") {
          expect(measurement.requested).toBeGreaterThan(measurement.max + 1);
          const editor = page.locator(`#comment-${lastId} .ProseMirror`).first();
          await expect(editor).toContainText("Protected boundary draft");
          await expect(page.locator(`#comment-${lastId}`).getByText("Replying to E2E User", { exact: true })).toBeVisible();
          expect(await editor.evaluate((element, original) => element === original, originalEditor)).toBe(true);
          await api.createComment(issueId, "New after boundary completion");
          await expect(page.getByText("New after boundary completion", { exact: true })).toBeInViewport();
          await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(80);
          await expect(page.locator('[data-chat-unread-status]')).toBeEmpty();
          release();
          expect((await uploaded!).ok()).toBe(true);
          await expect(editor).toContainText("boundary.txt");
          await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(80);
        }
        await page.screenshot({ path: `output/playwright/zjex-7-boundary-${edge}.png`, fullPage: true });
      } finally { release(); if (uploaded) await uploaded.catch(() => {}); }
    });
  }

  test("switches without losing a top-level draft and restores its local preference", async ({ page }) => {
    await page.getByTestId("comment-composer-shell").click();
    const editor = page.locator("[data-issue-comment-composer] .ProseMirror").first();
    await editor.fill("Unsent group chat draft");
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
    await page.screenshot({ path: "output/playwright/zjex-7-web-draft.png", fullPage: true });
    await expect(editor).toHaveText("Unsent group chat draft");
    await expect(page.getByRole("button", { name: "Group chat", exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Group chat", exact: true })).toBeVisible();
    await expect(page.locator('[data-comment-content]').filter({ hasText: "Second message" })).toHaveCount(1);
    await expect(page.locator('[data-comment-content]').filter({ hasText: "First message" })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  test("preserves a nested reply draft across both modes and lands its own deep link", async ({ page }) => {
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
    const scroller = page.locator('[data-tab-scroll-root*="main:"]');
    await scroller.hover();
    await page.mouse.wheel(0, 1000);
    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const reply = page.locator(`#comment-${replyId}`);
    await page.screenshot({ path: "output/playwright/zjex-7-web-reply-before.png", fullPage: true });
    await reply.hover();
    await reply.getByRole("button", { name: "Leave a reply...", exact: true }).click({ timeout: 10000 });
    await reply.getByTestId("reply-composer-shell").click();
    const editor = reply.locator(".ProseMirror").first();
    await editor.fill("Reply draft retained across modes");
    const uploaded = page.waitForResponse((response) => response.url().endsWith("/api/upload-file") && response.request().method() === "POST");
    await reply.locator('input[type="file"]').last().setInputFiles({ name: "reply-evidence.txt", mimeType: "text/plain", buffer: Buffer.from("Attachment retained across activity and chat") });
    expect((await uploaded).ok()).toBe(true);
    await expect(editor).toContainText("reply-evidence.txt");
    await page.getByRole("button", { name: "Group chat", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Activity", exact: true }).click();
    await expect(page.locator(`#comment-${rootId}`).locator(".ProseMirror").first()).toContainText("Reply draft retained across modes");
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
    await expect(reply.locator(".ProseMirror").first()).toContainText("Reply draft retained across modes");
    await expect(reply.locator(".ProseMirror").first()).toContainText("reply-evidence.txt");
    await scroller.hover();
    await page.mouse.wheel(0, 1000);
    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(async () => {
      await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const file = await reply.locator(".ProseMirror").first().getByText("reply-evidence.txt", { exact: true }).boundingBox();
      const composer = await page.locator("[data-issue-comment-composer]").boundingBox();
      return file && composer ? file.y + file.height - composer.y : Infinity;
    }).toBeLessThanOrEqual(-4);
    await page.screenshot({ path: "output/playwright/zjex-7-web-reply-attachment.png", fullPage: true });
    await page.goto(`/${slug}/issues/${issueId}#comment-${replyId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`#comment-${replyId}`)).toBeInViewport();
    expect(await page.locator(`#comment-${replyId}`).count()).toBe(1);
  });

  test("uses the source row's only annotation editor when returning from an offscreen reply", async ({ page }) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    for (let index = 0; index < 35; index++) {
      await api.createComment(issueId, `Annotation history ${index}\n\n${"Long historical context. ".repeat(20)}`);
    }
    const late = await api.createComment(issueId, "Late reply annotation host", rootId);
    for (let index = 0; index < 8; index++) {
      await api.createComment(issueId, `Following history ${index}\n\n${"Long historical context. ".repeat(20)}`);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
    const root = page.locator(`#comment-${rootId}`);
    const source = root.locator(`[data-comment-content="${rootId}"]`);
    await expect(source).toBeVisible();
    await source.evaluate((element) => {
      const paragraph = element.querySelector("p")!;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = getSelection()!;
      selection.removeAllRanges(); selection.addRange(range);
      paragraph.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
    });
    await page.getByRole("button", { name: "Add to reply", exact: true }).click();
    await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Original annotation note");
    await page.getByRole("button", { name: "Add annotation", exact: true }).click();
    const marker = page.locator('[data-reply-annotation-overlay]').getByRole("button", { name: "Edit annotation 1", exact: true });
    await expect(marker).toHaveCount(1);
    const scroller = page.locator('[data-tab-scroll-root*="main:"]');
    const reply = page.locator(`#comment-${late.id}`);
    const goToReply = async () => {
      await scroller.hover();
      await page.mouse.wheel(0, 1000);
      await expect.poll(async () => {
        if (await reply.count()) return true;
        await scroller.evaluate((element) => { element.scrollTop += 400; });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        return await reply.count() > 0;
      }, { timeout: 15000, intervals: [50, 100, 200] }).toBe(true);
      await reply.evaluate((element) => {
        const container = element.closest<HTMLElement>('[data-tab-scroll-root]')!;
        container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - 100;
      });
      await expect(reply).toBeInViewport();
    };
    await goToReply();
    await expect(root).toHaveCount(0);
    await reply.hover();
    await reply.getByRole("button", { name: "Leave a reply...", exact: true }).click();
    await reply.getByRole("button", { name: "1 annotation", exact: true }).click();
    await page.getByRole("dialog", { name: "1 annotation", exact: true }).getByRole("button", { name: "Edit annotation 1", exact: true }).click();
    const note = page.getByRole("textbox", { name: "Comment", exact: true });
    await expect(note).toHaveCount(1);
    await expect(note).toHaveValue("Original annotation note");
    await expect(root).toBeInViewport();
    await expect(marker).toHaveCount(1);
    await note.fill("New annotation saved by one owner");
    await marker.click();
    await expect(note).toHaveCount(1);
    await expect(note).toHaveValue("New annotation saved by one owner");
    await page.screenshot({ path: "output/playwright/zjex-7-annotation-single-owner.png", fullPage: true });
    await page.getByRole("button", { name: "Save annotation", exact: true }).click();
    await expect(note).toHaveCount(0);
    await expect(marker).toHaveCount(1);
    await marker.click();
    await expect(note).toHaveCount(1);
    await expect(note).toHaveValue("New annotation saved by one owner");
    await note.press("Escape");
    await goToReply();
    await reply.getByRole("button", { name: "1 annotation", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "1 annotation", exact: true })).toContainText("New annotation saved by one owner");
    await page.screenshot({ path: "output/playwright/zjex-7-annotation-retained-draft.png", fullPage: true });
  });

  test.describe("touch message headers", () => {
    test.use({ hasTouch: true });
    test("keeps long sender identity and time on one line at 390px with touch controls", async ({ page, context }) => {
      const longName = "一位名称很长的测试参与者用于验证窄屏消息头截断布局保持稳定";
      await api.login(api.getEmail(), longName);
      await page.getByRole("button", { name: "Activity", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
      await context.addCookies([{ name: "multica-locale", value: "zh-Hans", url: new URL(page.url()).origin }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "domcontentloaded" });
      const row = page.locator(`#comment-${rootId}`);
      await expect(row.locator('[data-comment-author]')).toHaveText(longName);
      const geometry = await row.evaluate((element) => {
        const author = element.querySelector<HTMLElement>('[data-comment-author]')!;
        const identity = element.querySelector<HTMLElement>('[data-comment-identity]')!;
        const time = element.querySelector<HTMLElement>('[data-comment-time]')!;
        return { truncated: author.scrollWidth > author.clientWidth,
          identity: { top: identity.getBoundingClientRect().top, height: identity.offsetHeight, line: parseFloat(getComputedStyle(identity).lineHeight) },
          time: { top: time.getBoundingClientRect().top, height: time.offsetHeight, line: parseFloat(getComputedStyle(time).lineHeight) },
          touch: matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches };
      });
      console.info("390px touch header measurement", JSON.stringify(geometry));
      expect(geometry.touch).toBe(true);
      expect(geometry.truncated).toBe(true);
      expect(geometry.identity.height).toBeLessThanOrEqual(geometry.identity.line + 1);
      expect(geometry.time.height).toBeLessThanOrEqual(geometry.time.line + 1);
      expect(Math.abs(geometry.identity.top - geometry.time.top)).toBeLessThan(2);
      const actions = row.locator('[data-comment-actions] button');
      for (const button of await actions.all()) await expect(button).toBeInViewport();
      await actions.last().tap();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.screenshot({ path: "output/playwright/zjex-7-touch-390-long-name.png", fullPage: true });
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await api.login(api.getEmail(), "E2E User");
    });
  });

  test("restores a middle comment across mouse and keyboard switches with a pending reply upload", async ({ page }) => {
    test.setTimeout(120000);
    for (let index = 0; index < 65; index++) {
      await api.createComment(issueId, `History ${index}\n\n${"Long historical context. ".repeat(20)}`);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
    const scroller = page.locator('[data-tab-scroll-root*="main:"]');
    await scroller.hover();
    await page.mouse.wheel(0, 4230);
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(3000);
    const anchorId = await scroller.evaluate((container) => {
      const bounds = container.getBoundingClientRect();
      const row = [...container.querySelectorAll<HTMLElement>('[data-comment-block]')]
        .find((row) => row.getBoundingClientRect().top > bounds.top && row.getBoundingClientRect().top < bounds.top + 300);
      if (!row) throw new Error("No fully visible middle comment");
      return row.closest<HTMLElement>('[id^="comment-"]')!.id;
    });
    const row = page.locator(`[id="${anchorId}"]`);
    await row.hover();
    await row.getByRole("button", { name: "Leave a reply...", exact: true }).click();
    await row.getByTestId("reply-composer-shell").click();
    const editor = row.locator(".ProseMirror");
    await editor.fill("Middle reply draft and exact target");
    let release!: () => void;
    const uploadGate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/upload-file", async (route) => { await uploadGate; await route.continue(); });
    const upload = page.waitForResponse((response) => response.url().endsWith("/api/upload-file") && response.request().method() === "POST");
    await row.locator('input[type="file"]').last().setInputFiles({ name: "middle-upload.txt", mimeType: "text/plain", buffer: Buffer.from("Real delayed attachment") });
    const reading = await scroller.evaluate((container) => {
      const bounds = container.getBoundingClientRect();
      const block = [...container.querySelectorAll<HTMLElement>("[data-comment-block]")]
        .find((element) => element.getBoundingClientRect().bottom > bounds.top && element.getBoundingClientRect().top < bounds.bottom);
      const anchor = block!.closest<HTMLElement>('[id^="comment-"]')!;
      return { id: anchor.id, offset: anchor.getBoundingClientRect().top - bounds.top };
    });
    const readingRow = page.locator(`[id="${reading.id}"]`);
    const editorHandle = await editor.elementHandle();
    await page.screenshot({ path: "output/playwright/zjex-7-middle-reply-before.png", fullPage: true });
    try {
      for (const [index, destination] of ["Activity", "Group chat", "Activity", "Group chat"].entries()) {
        const current = destination === "Activity" ? "Group chat" : "Activity";
        const toggle = page.getByRole("button", { name: current, exact: true });
        if (index < 2) {
          await toggle.click();
          await page.getByRole("menuitemradio", { name: destination, exact: true }).click();
        } else {
          await toggle.focus();
          await page.keyboard.press("Enter");
          await page.keyboard.press(destination === "Activity" ? "Home" : "End");
          await page.keyboard.press("Enter");
        }
        await expect(page.getByRole("button", { name: destination, exact: true })).toBeVisible();
        await expect(readingRow).toHaveCount(1);
        await expect.poll(() => readingRow.evaluate((element) => element.getBoundingClientRect().top - element.closest('[data-tab-scroll-root]')!.getBoundingClientRect().top)).toBeCloseTo(reading.offset, 0);
        const samples = await scroller.evaluate(async (container, { anchorId, before }) => {
          const samples: Array<number | null> = [];
          for (let frame = 0; frame < 35; frame++) {
            await new Promise(requestAnimationFrame);
            const element = document.getElementById(anchorId);
            samples.push(element ? element.getBoundingClientRect().top - container.getBoundingClientRect().top - before : null);
          }
          return samples;
        }, { anchorId: reading.id, before: reading.offset });
        expect(samples, `Anchor disappeared switching to ${destination}`).not.toContain(null);
        const maxError = Math.max(...samples.map((offset) => Math.abs(offset!)));
        console.info("Middle anchor measurement", JSON.stringify({ reading, destination, index, paints: samples.length, maxError }));
        expect(maxError).toBeLessThan(2);
        await expect(editor).toContainText("Middle reply draft and exact target");
        await expect(row.getByText("Replying to E2E User", { exact: true })).toBeVisible();
        expect(await page.evaluate(({ issueId, target }) => Object.entries(localStorage).some(([key, value]) => {
          if (!key.includes("multica_comment_drafts")) return false;
          return JSON.parse(value).state?.drafts?.[`reply:${issueId}:${target}`]?.replyTarget?.commentId === target;
        }), { issueId, target: anchorId.slice(8) })).toBe(true);
        expect(await editor.evaluate((element, original) => element === original, editorHandle)).toBe(true);
        await page.screenshot({ path: `output/playwright/zjex-7-middle-${index}-${destination === "Activity" ? "activity" : "chat"}.png`, fullPage: true });
      }
    } finally { release(); }
    expect((await upload).ok()).toBe(true);
    await expect(editor).toContainText("middle-upload.txt");
    await page.screenshot({ path: "output/playwright/zjex-7-middle-upload-complete.png", fullPage: true });
  });

  for (const returnVia of ["uuid", "history"] as const) {
    test(`${returnVia}: keeps zero after immediately leaving the top with a reply draft`, async ({ page }) => {
      test.setTimeout(120000);
      const canonicalUrl = page.url();
      let targetId = "";
      let threadId = "";
      for (let index = 0; index < 55; index++) {
        const comment = await api.createComment(issueId, `Top return history ${index}\n\n${"Long reading context. ".repeat(20)}`);
        if (index === 15) {
          threadId = comment.id;
          targetId = (await api.createComment(issueId, "Precise nested reply source", threadId)).id;
        }
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Activity", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
      const scroller = page.locator('[data-tab-scroll-root*="main:"]');
      const containerKey = (await scroller.getAttribute("data-tab-scroll-root"))!;
      await page.evaluate(() => {
        const clicks: unknown[] = [];
        Object.assign(window, { topReturnClicks: clicks });
        window.addEventListener("click", (event) => {
          const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
          if (!(link instanceof HTMLAnchorElement)) return;
          clicks.push({ time: performance.now(), path: location.pathname, href: link.pathname,
            roots: [...document.querySelectorAll<HTMLElement>("[data-tab-scroll-root]")].map((element) => ({
              key: element.dataset.tabScrollRoot, connected: element.isConnected, top: element.scrollTop, height: element.scrollHeight,
            })),
          });
        }, { capture: true });
      });
      const draftKey = `reply:${issueId}:${threadId}`;
      const readDraft = () => page.evaluate((key) => {
        for (const [name, value] of Object.entries(localStorage)) {
          if (name.includes("multica_comment_drafts")) {
            const draft = JSON.parse(value).state?.drafts?.[key];
            if (draft) return { content: draft.content, target: draft.replyTarget?.commentId };
          }
        }
        return null;
      }, draftKey);
      const leaveAndReturn = async () => {
        await page.getByRole("link", { name: "Issues", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${slug}/issues$`), { timeout: 30000 });
        await expect(page.getByRole("button", { name: "New Issue", exact: true })).toBeVisible();
        if (returnVia === "uuid") await page.locator(`a[href$="/issues/${issueId}"]`).first().click();
        else await page.goBack();
        await page.waitForURL(canonicalUrl, { waitUntil: "commit" });
        await expect(page.getByRole("button", { name: "Group chat", exact: true })).toBeVisible();
      };
      const captureAnchor = () => scroller.evaluate((container) => {
        const bounds = container.getBoundingClientRect();
        const block = [...container.querySelectorAll<HTMLElement>("[data-comment-block]")].find((row) => row.getBoundingClientRect().bottom > bounds.top && row.getBoundingClientRect().top < bounds.bottom);
        const row = block!.closest<HTMLElement>('[id^="comment-"]')!;
        return { id: row.id, offset: row.getBoundingClientRect().top - bounds.top };
      });
      const assertAnchor = async (anchor: { id: string; offset: number }) => {
        await expect(page.locator(`[id="${anchor.id}"]`)).toBeInViewport();
        await expect.poll(() => scroller.evaluate((container, id) => {
          const row = container.querySelector(`[id="${id}"]`);
          return row ? row.getBoundingClientRect().top - container.getBoundingClientRect().top : null;
        }, anchor.id)).toBeCloseTo(anchor.offset, 0);
        const frames = await page.evaluate(sampleReadingAnchor, { containerKey, anchor, frames: 35 });
        expect(frames.every((frame) => frame.connected && frame.visible)).toBe(true);
        expect(frames.map((frame) => frame.error)).not.toContain(null);
        expect(Math.max(...frames.map((frame) => Math.abs(frame.error!)))).toBeLessThan(2);
        return frames;
      };
      try {
        await scroller.hover(); await page.mouse.wheel(0, 3800);
        const target = page.locator(`#comment-${targetId}`);
        await expect(target).toBeInViewport();
        await target.hover();
        await target.getByRole("button", { name: "Leave a reply...", exact: true }).click();
        await target.getByTestId("reply-composer-shell").click();
        await target.locator(".ProseMirror").fill("Top return protected reply draft");
        await expect.poll(readDraft).toEqual({ content: "Top return protected reply draft", target: targetId });
        const beforeWheelTop = await scroller.evaluate((container) => container.scrollTop);
        await scroller.hover(); await page.mouse.wheel(0, 400);
        await expect.poll(() => scroller.evaluate((container) => container.scrollTop)).toBeGreaterThan(beforeWheelTop);
        await page.evaluate(async (key) => {
          let previous = ""; let stable = 0;
          for (let frame = 0; frame < 120; frame++) {
            await new Promise(requestAnimationFrame);
            const container = [...document.querySelectorAll<HTMLElement>("[data-tab-scroll-root]")].find((element) => element.isConnected && element.getAttribute("data-tab-scroll-root") === key);
            const geometry = container ? `${container.scrollTop}:${container.scrollHeight}:${container.clientHeight}` : "";
            stable = geometry && geometry === previous ? stable + 1 : 0;
            if (stable >= 3) return;
            previous = geometry;
          }
          throw new Error("Initial reading geometry did not settle");
        }, containerKey);
        const middle = await captureAnchor();
        const middleTop = await scroller.evaluate((container) => container.scrollTop);
        await leaveAndReturn();
        const middleFrames = await assertAnchor(middle);
        await scroller.hover(); await page.mouse.wheel(0, -20000);
        await expect.poll(() => scroller.evaluate((container) => container.scrollTop)).toBe(0);
        const top = await captureAnchor();
        await leaveAndReturn();
        const topFrames = await assertAnchor(top);
        await expect.poll(() => scroller.evaluate((container) => container.scrollTop)).toBe(0);
        await expect.poll(readDraft).toEqual({ content: "Top return protected reply draft", target: targetId });
        await page.screenshot({ path: `output/playwright/zjex-7-zero-return-${returnVia}.png`, fullPage: true });
        console.info("Top return measurement", JSON.stringify({ returnVia, middleTop, middle, top, middleFrames, topFrames,
          clicks: await page.evaluate(() => (window as typeof window & { topReturnClicks: unknown[] }).topReturnClicks) }));
        await scroller.hover(); await page.mouse.wheel(0, 3800);
        await expect(target.locator(".ProseMirror")).toContainText("Top return protected reply draft");
        await expect.poll(readDraft).toEqual({ content: "Top return protected reply draft", target: targetId });
      } catch (error) {
        const evidence = await page.evaluate(() => ({ path: location.pathname, clicks: (window as typeof window & { topReturnClicks: unknown[] }).topReturnClicks,
          roots: [...document.querySelectorAll<HTMLElement>("[data-tab-scroll-root]")].map((element) => ({ key: element.dataset.tabScrollRoot, connected: element.isConnected, top: element.scrollTop, height: element.scrollHeight, text: element.innerText.slice(0, 300) })) }));
        console.info("Top return failure before cleanup", JSON.stringify(evidence));
        await page.screenshot({ path: `output/playwright/zjex-7-zero-return-${returnVia}-failure.png`, fullPage: true });
        throw error;
      }
    });
  }

  test("keeps historical reading in place and follows only near the bottom", async ({ page }) => {
    const canonicalIssueUrl = page.url();
    for (let index = 0; index < 65; index += 1) {
      await api.createComment(issueId, `History ${index}\n\n${"Long historical context. ".repeat(20)}`);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
    const scroller = page.locator('[data-tab-scroll-root*="main:"]');
    const containerKey = (await scroller.getAttribute("data-tab-scroll-root"))!;
    await scroller.hover();
    await page.mouse.wheel(0, 4230);
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const anchor = await scroller.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const block = [...element.querySelectorAll<HTMLElement>("[data-comment-block]")].find((row) => row.getBoundingClientRect().bottom > bounds.top && row.getBoundingClientRect().top < bounds.bottom);
      const row = block?.closest<HTMLElement>('[id^="comment-"]');
      if (!row) throw new Error("No visible comment anchor");
      return { id: row.id, offset: row.getBoundingClientRect().top - bounds.top };
    });
    await page.screenshot({ path: "output/playwright/zjex-7-middle-before.png", fullPage: true });
    await page.getByRole("button", { name: "Group chat", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Activity", exact: true }).click();
    await page.screenshot({ path: "output/playwright/zjex-7-middle-after.png", fullPage: true });
    await expect.poll(() => page.locator(`[id="${anchor.id}"]`).evaluate((row) => row.getBoundingClientRect().top - row.closest('[data-tab-scroll-root]')!.getBoundingClientRect().top)).toBeCloseTo(anchor.offset, 0);
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Group chat", exact: true }).click();
    await expect.poll(() => page.locator(`[id="${anchor.id}"]`).evaluate((row) => row.getBoundingClientRect().top - row.closest('[data-tab-scroll-root]')!.getBoundingClientRect().top)).toBeCloseTo(anchor.offset, 0);
    // Observe actual anchors over consecutive paints, including late virtualizer corrections.
    const samples = await page.evaluate(sampleReadingAnchor, { containerKey, anchor, frames: 40 });
    expect(samples.every((sample) => sample.connected && sample.visible)).toBe(true);
    expect(samples.map((sample) => sample.error), "Anchor drift across consecutive paints").not.toContain(null);
    expect(Math.max(...samples.map((sample) => Math.abs(sample.error!)))).toBeLessThan(2);
    const saved = await scroller.evaluate((element) => element.scrollTop);
    await page.getByRole("link", { name: "Issues", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/issues$`), { timeout: 30000 });
    await expect(page.getByRole("button", { name: "New Issue", exact: true })).toBeVisible();
    await page.locator(`a[href$="/issues/${issueId}"]`).first().click();
    await page.waitForURL(canonicalIssueUrl, { waitUntil: "commit" });
    await expect(page.getByRole("button", { name: "Group chat", exact: true })).toBeVisible();
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeCloseTo(saved, 0);
    await expect(page.locator(`[id="${anchor.id}"]`)).toBeInViewport();
    await expect.poll(() => page.locator(`[id="${anchor.id}"]`).evaluate((row) => row.getBoundingClientRect().top - row.closest('[data-tab-scroll-root]')!.getBoundingClientRect().top)).toBeCloseTo(anchor.offset, 0);
    const returned = await page.evaluate(sampleReadingAnchor, { containerKey, anchor, frames: 35 });
    expect(returned.every((sample) => sample.connected && sample.visible)).toBe(true);
    expect(returned.map((sample) => sample.error)).not.toContain(null);
    expect(Math.max(...returned.map((sample) => Math.abs(sample.error!)))).toBeLessThan(2);
    await page.screenshot({ path: "output/playwright/zjex-7-reading-returned.png", fullPage: true });
    const before = await scroller.evaluate((element) => element.scrollTop);
    const modeButton = page.getByRole("button", { name: "Group chat", exact: true });
    await modeButton.focus();
    const unreadStatus = page.locator('[data-chat-unread-status]');
    await expect(unreadStatus).toBeEmpty();
    await api.createComment(issueId, "New while reading history");
    await expect(unreadStatus).toHaveText("1 new message");
    await expect(modeButton).toBeFocused();
    await page.screenshot({ path: "output/playwright/zjex-7-history-unread-status.png", fullPage: true });
    await expect(page.getByRole("button", { name: "1 new message", exact: true })).toBeVisible();
    expect(Math.abs(await scroller.evaluate((element) => element.scrollTop) - before)).toBeLessThan(3);
    await page.getByRole("button", { name: "1 new message", exact: true }).click();
    await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(80);
    await api.createComment(issueId, "New while following");
    await expect(page.getByText("New while following", { exact: true })).toBeVisible();
    await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(80);
    await page.screenshot({ path: "output/playwright/zjex-7-web-chat.png", fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: "output/playwright/zjex-7-web-dark.png", fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "output/playwright/zjex-7-web-narrow.png", fullPage: true });
  });

});
