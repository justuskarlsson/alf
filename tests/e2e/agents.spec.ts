import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { goToRepo, withAgentsPanel } from "./helpers";

// These tests drive the real Cursor agent backend. Keep prompts tiny and use a
// cheap model (set CURSOR_MODEL on the test backend) so runs are fast and cheap.
// Assistant output is non-deterministic, so message tests assert on:
//   - the user prompt echo (deterministic, shown immediately), and
//   - turn completion + a persisted text activity (not exact content).
//
// A live turn takes seconds, so message tests use a generous timeout.

/** A trivial prompt that resolves quickly on any model. */
const PROMPT = "Reply with exactly the word: ok";
/** Cheapest curated model — keeps live e2e runs cheap and fast. */
const CHEAP_MODEL = "claude-haiku-4-5";
/** Max time to allow a real turn to finish. */
const TURN = 120_000;

async function newSession(page: Page) {
  await page.getByTestId("new-session-btn").click();
  await expect(page.getByTestId("prompt-input")).toBeVisible({ timeout: 5_000 });
  // Use the cheap model for every live turn.
  await page.getByTestId("model-selector").selectOption(CHEAP_MODEL);
}

async function send(page: Page, text: string) {
  await page.getByTestId("prompt-input").fill(text);
  await page.getByRole("button", { name: "send" }).click();
}

/** Wait until the running turn finishes (stop button gone, send button back). */
async function waitTurnDone(page: Page) {
  await expect(page.getByTestId("stop-btn")).toHaveCount(0, { timeout: TURN });
  await expect(page.getByRole("button", { name: "send" })).toBeVisible({ timeout: 5_000 });
}

/** A persisted (non-live) text activity has rendered in the feed. */
async function expectAssistantText(page: Page) {
  await expect(page.getByTestId("chat-feed").locator("[data-activity-type='text']").first())
    .toBeVisible({ timeout: TURN });
}

test.describe("Agents panel", () => {
  test.beforeEach(async ({ page }) => {
    await withAgentsPanel(page);
    await goToRepo(page);
    // Wait for panel to mount AND relay to connect (session list loads)
    await expect(page.getByTestId("new-session-btn")).toBeVisible();
    await expect(page.getByTestId("session-list")).toBeVisible({ timeout: 5_000 });
  });

  // ── Session management ──────────────────────────────────────────────────────

  test("create session → appears in session list", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("session-list")).toContainText("New session");
  });

  test("new session auto-selects → chat input is shown", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible();
  });

  test("multiple sessions appear in list", async ({ page }) => {
    await newSession(page);
    await newSession(page);
    const count = await page.getByTestId("session-list").getByText("New session").count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── Messaging ─────────────────────────────────────────────────────────────

  test("send message → pending prompt appears immediately in feed", async ({ page }) => {
    await newSession(page);
    await send(page, "hello world");

    // Pending prompt shown right away (before any server response)
    await expect(page.getByTestId("chat-feed")).toContainText("hello world");
    // Input is cleared while running (but stays enabled for typing next message)
    await expect(page.getByTestId("prompt-input")).toHaveValue("");
  });

  test("full turn — completes and renders a text response", async ({ page }) => {
    await newSession(page);
    await send(page, PROMPT);
    await waitTurnDone(page);
    await expectAssistantText(page);
  });

  test("input re-enables after turn completes", async ({ page }) => {
    await newSession(page);
    await send(page, PROMPT);
    await waitTurnDone(page);
    await expect(page.getByTestId("prompt-input")).toBeEnabled();
  });

  // ── Input ───────────────────────────────────────────────────────────────────

  test("Enter key sends message (not Shift+Enter)", async ({ page }) => {
    await newSession(page);
    await page.getByTestId("prompt-input").fill("enter key test");
    await page.getByTestId("prompt-input").press("Enter");
    await expect(page.getByTestId("chat-feed")).toContainText("enter key test");
  });

  test("Shift+Enter inserts newline instead of sending", async ({ page }) => {
    await newSession(page);
    const input = page.getByTestId("prompt-input");
    await input.fill("line one");
    await input.press("Shift+Enter");
    await input.type("line two");
    // Input should still be enabled (message not sent yet)
    await expect(input).toBeEnabled();
    await expect(input).not.toBeDisabled();
    // Feed should NOT contain any pending message yet
    await expect(page.getByTestId("chat-feed")).not.toContainText("line one");
  });

  // ── Focus & UX ─────────────────────────────────────────────────────────────

  test("creating a session focuses the prompt input", async ({ page }) => {
    // Stub window.prompt to avoid a dialog that steals document focus in headless mode
    await page.evaluate(() => { window.prompt = () => ""; });
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible();
    // Focus happens asynchronously after session creation completes
    await expect(page.getByTestId("prompt-input")).toBeFocused({ timeout: 5_000 });
  });

  test("clicking a session focuses the prompt input", async ({ page }) => {
    // Create two sessions so we can click between them
    await newSession(page);
    await newSession(page);

    // Click the second session in the list (first one created, now at index 1)
    await page.evaluate(() => {
      const items = document.querySelectorAll('[data-testid="session-list"] .divide-y > div');
      (items[1] as HTMLElement)?.click();
    });
    await expect(page.getByTestId("prompt-input")).toBeFocused({ timeout: 3_000 });
  });

  test("send button is vertically centered with input", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible();

    const input = page.getByTestId("prompt-input");
    const sendBtn = page.getByRole("button", { name: "send" });
    const inputBox = await input.boundingBox();
    const btnBox = await sendBtn.boundingBox();

    // The button center should be within the vertical span of the input
    if (inputBox && btnBox) {
      const inputCenterY = inputBox.y + inputBox.height / 2;
      const btnCenterY = btnBox.y + btnBox.height / 2;
      expect(Math.abs(inputCenterY - btnCenterY)).toBeLessThan(inputBox.height / 2);
    }
  });

  // ── Markdown rendering ────────────────────────────────────────────────────

  test("finished text activity renders markdown", async ({ page }) => {
    await newSession(page);
    await send(page, PROMPT);
    await waitTurnDone(page);

    // Text activities are rendered inside a markdown (prose) container.
    const textActivity = page.getByTestId("chat-feed").locator("[data-activity-type='text']").first();
    await expect(textActivity).toBeVisible({ timeout: TURN });
    await expect(textActivity.locator(".prose")).toBeVisible();
  });

  // ── WS protocol: response timing ─────────────────────────────────────────

  test("agent/message reply arrives before turn/done", async ({ page }) => {
    // Intercept WS frames to verify response ordering
    const frames: { type: string; ts: number }[] = [];
    page.on("websocket", ws => {
      ws.on("framereceived", data => {
        try {
          const msg = JSON.parse(data.payload as string);
          if (typeof msg.type === "string" && msg.type.startsWith("agent/")) {
            frames.push({ type: msg.type, ts: Date.now() });
          }
        } catch {}
      });
    });

    await page.reload(); // re-establish WS with listener active
    await expect(page.getByTestId("new-session-btn")).toBeVisible();
    await newSession(page);
    await send(page, PROMPT);
    await waitTurnDone(page);

    const reply = frames.find(f => f.type === "agent/message");
    const turnDone = frames.find(f => f.type === "agent/turn/done");

    expect(reply).toBeTruthy();
    expect(turnDone).toBeTruthy();
    // Reply (which carries the sessionId) must arrive before the turn completes.
    expect(reply!.ts).toBeLessThan(turnDone!.ts);
  });

  // ── Model selector ──────────────────────────────────────────────────────────

  test("model selector is visible when session is active", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible();
    await expect(page.getByTestId("model-selector")).toBeVisible();
  });

  // ── Attachments ─────────────────────────────────────────────────────────────

  test("attach file button and file chips appear in composer", async ({ page }) => {
    await newSession(page);

    // Verify attach button is visible
    await expect(page.getByTestId("attach-btn")).toBeVisible();

    // Upload a file via the hidden file input
    const fileInput = page.getByTestId("file-input");
    await fileInput.setInputFiles({
      name: "test-doc.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Hello from test file"),
    });

    // File chip should appear
    await expect(page.getByTestId("attached-files")).toBeVisible();
    await expect(page.getByTestId("attached-files")).toContainText("test-doc.txt");

    // Send message with file attached
    await send(page, "check this file");

    // Chips should be cleared after send
    await expect(page.getByTestId("attached-files")).toHaveCount(0);
    await waitTurnDone(page);
  });

  // ── Fork & persistence ───────────────────────────────────────────────────

  test("fork button creates new session with copied history", async ({ page }) => {
    await newSession(page);
    await send(page, "original message");
    await waitTurnDone(page);
    await expect(page.getByTestId("chat-feed")).toContainText("original message");

    // Fork button should be visible (session has turns)
    const forkBtn = page.getByTestId("fork-btn");
    await expect(forkBtn).toBeVisible();
    await forkBtn.click();

    // New session should appear in list with "Fork of" title
    await expect(page.getByTestId("session-list")).toContainText("Fork of", { timeout: 5000 });

    // Forked session should have the copied history (the user prompt)
    await expect(page.getByTestId("chat-feed")).toContainText("original message", { timeout: 5000 });
  });

  test("session and history persist after page reload", async ({ page }) => {
    await newSession(page);
    await send(page, "persist me");
    await waitTurnDone(page);
    await expect(page.getByTestId("chat-feed")).toContainText("persist me");

    // Reload the page
    await page.reload();
    await expect(page.getByTestId("new-session-btn")).toBeVisible();

    // Wait for sessions to reload from backend after relay reconnects
    await expect(page.getByTestId("session-list")).toContainText("New session", { timeout: 10_000 });

    // Re-select the session — use JS click to bypass react-grid-layout overlay
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="session-list"] .divide-y > div') as HTMLElement;
      el?.click();
    });
    await expect(page.getByTestId("chat-feed")).toContainText("persist me", { timeout: 10_000 });
  });

  // ── Stop button (placed last — abort can cause transient backend disruption) ──

  test("stop button appears during streaming and disappears after", async ({ page }) => {
    page.on("dialog", d => d.accept("stop-appear-test"));
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("session-list")).toContainText("stop-appear-test", { timeout: 5_000 });
    await page.getByTestId("model-selector").selectOption(CHEAP_MODEL);
    await send(page, PROMPT);

    // Stop button should appear while running
    await expect(page.getByTestId("stop-btn")).toBeVisible({ timeout: 10_000 });

    // Wait for turn to complete naturally
    await waitTurnDone(page);
  });

  test("clicking stop cancels the active turn", async ({ page }) => {
    page.on("dialog", d => d.accept("stop-cancel-test"));
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("session-list")).toContainText("stop-cancel-test", { timeout: 5_000 });
    await page.getByTestId("model-selector").selectOption(CHEAP_MODEL);
    await send(page, "Write a long detailed essay about the history of computing.");

    // Wait for stop button to appear
    await expect(page.getByTestId("stop-btn")).toBeVisible({ timeout: 10_000 });

    // Click stop
    await page.getByTestId("stop-btn").click();

    // Stop button disappears and send button re-enables (isRunning cleared)
    await expect(page.getByTestId("stop-btn")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "send" })).toBeVisible({ timeout: 5_000 });
  });
});
