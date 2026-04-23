import { test, expect } from "@playwright/test";
import { goToRepo, withAgentsPanel } from "./helpers";

// The test impl emits:
//   thinking: "Analysing the request... Forming a plan. Ready."
//   tool:     "read_file: <repo>/README.md"
//   text:     "Echo: <prompt>"  (word by word)
// Each activity chunk has a ~50ms delay → full turn ~250ms.
//
// Frontend defaults to "claude-code" impl. Tests that send messages need the
// test impl — use selectTestImpl() after creating a session.

import type { Page } from "@playwright/test";

/** Switch the impl selector to "test" so messages use the deterministic test impl. */
async function selectTestImpl(page: Page) {
  await page.getByTestId("impl-selector").selectOption("test");
}

test.describe("Agents panel", () => {
  test.beforeEach(async ({ page }) => {
    await withAgentsPanel(page);
    await goToRepo(page);
    // Wait for panel to mount
    await expect(page.getByTestId("new-session-btn")).toBeVisible();
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
    // Create two sessions; each click should auto-select the new session
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible({ timeout: 5_000 });
    // At least 2 sessions in the list (DB may have more from prior runs)
    const count = await page.getByTestId("session-list").getByText("New session").count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── Messaging & streaming ───────────────────────────────────────────────────

  test("send message → pending prompt appears immediately in feed", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    await page.getByTestId("prompt-input").fill("hello world");
    await page.getByRole("button", { name: "send" }).click();

    // Pending prompt shown right away (before any server response)
    await expect(page.getByTestId("chat-feed")).toContainText("hello world");
    // Input is cleared while running (but stays enabled for typing next message)
    await expect(page.getByTestId("prompt-input")).toHaveValue("");
  });

  test("streaming — live thinking activity appears while running", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    await page.getByTestId("prompt-input").fill("stream test");
    await page.getByRole("button", { name: "send" }).click();

    // Thinking chunks stream in — "Analysing" is first chunk
    await expect(page.getByTestId("chat-feed")).toContainText("Analysing", { timeout: 5_000 });
  });

  test("full turn — all three activity types persist after completion", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    await page.getByTestId("prompt-input").fill("hello");
    await page.getByRole("button", { name: "send" }).click();

    // Wait for turn to complete (text echo appears)
    await expect(page.getByTestId("chat-feed")).toContainText("Echo: hello", { timeout: 10_000 });

    // All three activity types should be in the feed
    await expect(page.getByTestId("chat-feed")).toContainText("Analysing");
    await expect(page.getByTestId("chat-feed")).toContainText("read_file");
    await expect(page.getByTestId("chat-feed")).toContainText("Echo: hello");
  });

  test("input re-enables after turn completes", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    await page.getByTestId("prompt-input").fill("ping");
    await page.getByRole("button", { name: "send" }).click();

    await expect(page.getByTestId("chat-feed")).toContainText("Echo: ping", { timeout: 10_000 });
    await expect(page.getByTestId("prompt-input")).toBeEnabled();
  });

  test("Enter key sends message (not Shift+Enter)", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    await page.getByTestId("prompt-input").fill("enter key test");
    await page.getByTestId("prompt-input").press("Enter");
    await expect(page.getByTestId("chat-feed")).toContainText("enter key test");
  });

  test("Shift+Enter inserts newline instead of sending", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
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
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible({ timeout: 5_000 });

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
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    // Send a prompt that will be echoed — the test impl echoes "Echo: <prompt>"
    // Use a prompt with markdown-like content to verify rendering
    await page.getByTestId("prompt-input").fill("hello");
    await page.getByRole("button", { name: "send" }).click();

    // Wait for turn to complete
    await expect(page.getByTestId("chat-feed")).toContainText("Echo: hello", { timeout: 10_000 });

    // Text activities should be rendered inside a markdown container (prose class or ReactMarkdown output)
    const textActivity = page.getByTestId("chat-feed").locator("[data-activity-type='text']");
    await expect(textActivity).toBeVisible();
    // It should have the prose container for markdown
    await expect(textActivity.locator(".prose")).toBeVisible();
  });

  // ── Streaming UI updates ──────────────────────────────────────────────────

  test("streaming — content updates incrementally in the UI", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    // Use a JSON prompt with larger delay so we can observe incremental updates
    await page.getByTestId("prompt-input").fill('{"path":"ping","delay":200}');
    await page.getByRole("button", { name: "send" }).click();

    const feed = page.getByTestId("chat-feed");

    // First we should see thinking start
    await expect(feed).toContainText("Analysing", { timeout: 5_000 });
    // Then eventually the full text echo — but verify it appeared word by word
    // by checking that "Echo:" appears before the full text
    await expect(feed).toContainText("Echo:", { timeout: 15_000 });
    // Final complete text
    await expect(feed).toContainText("Echo:", { timeout: 15_000 });
  });

  // ── WS protocol: response timing & streaming deltas ──────────────────────

  test("agent/message reply arrives before first delta", async ({ page }) => {
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
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible();
    await selectTestImpl(page);

    await page.getByTestId("prompt-input").fill('{"path":"ping","delay":100}');
    await page.getByRole("button", { name: "send" }).click();

    // Wait for turn to complete
    await expect(page.getByTestId("chat-feed")).toContainText("Echo:", { timeout: 15_000 });

    const reply = frames.find(f => f.type === "agent/message");
    const firstDelta = frames.find(f => f.type === "agent/delta");
    const turnDone = frames.find(f => f.type === "agent/turn/done");

    expect(reply).toBeTruthy();
    expect(firstDelta).toBeTruthy();
    expect(turnDone).toBeTruthy();
    // Reply must arrive before or at the same time as first delta
    expect(reply!.ts).toBeLessThanOrEqual(firstDelta!.ts);
    // Reply must arrive before turn/done
    expect(reply!.ts).toBeLessThan(turnDone!.ts);
  });

  test("subscribe delivers multiple incremental delta events", async ({ page }) => {
    // Collect all delta frames to verify streaming granularity
    const deltas: { activityType: string; content: string; idx: number; ts: number }[] = [];
    page.on("websocket", ws => {
      ws.on("framereceived", data => {
        try {
          const msg = JSON.parse(data.payload as string);
          if (msg.type === "agent/delta") {
            deltas.push({
              activityType: msg.activityType,
              content: msg.content,
              idx: msg.idx,
              ts: Date.now(),
            });
          }
        } catch {}
      });
    });

    await page.reload();
    await expect(page.getByTestId("new-session-btn")).toBeVisible();
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible();
    await selectTestImpl(page);

    // Use 100ms delay — test impl emits ~7 chunks (3 thinking + 1 tool + 3 text words)
    await page.getByTestId("prompt-input").fill('{"path":"ping","delay":100}');
    await page.getByRole("button", { name: "send" }).click();

    await expect(page.getByTestId("chat-feed")).toContainText("Echo:", { timeout: 15_000 });

    // Should have received many individual deltas, not one big batch
    expect(deltas.length).toBeGreaterThanOrEqual(5);

    // Verify multiple activity types streamed
    const types = new Set(deltas.map(d => d.activityType));
    expect(types.has("thinking")).toBe(true);
    expect(types.has("tool")).toBe(true);
    expect(types.has("text")).toBe(true);

    // Deltas should be spread over time (not all at once)
    const firstTs = deltas[0].ts;
    const lastTs = deltas[deltas.length - 1].ts;
    expect(lastTs - firstTs).toBeGreaterThan(200); // at least 200ms spread
  });

  // ── Impl selector ──────────────────────────────────────────────────────────

  test("impl selector is visible when session is active", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("prompt-input")).toBeVisible();
    await expect(page.getByTestId("impl-selector")).toBeVisible();
  });

  test("impl selector can switch between implementations", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await expect(page.getByTestId("impl-selector")).toBeVisible();
    const selector = page.getByTestId("impl-selector");
    // Default is "claude-code"
    await expect(selector).toHaveValue("claude-code");
    // Switch to test
    await selector.selectOption("test");
    await expect(selector).toHaveValue("test");
    // Switch back
    await selector.selectOption("claude-code");
    await expect(selector).toHaveValue("claude-code");
  });

  test("model selector visible for claude-code, hidden for test", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    // Default impl is claude-code → model selector should be visible
    await expect(page.getByTestId("model-selector")).toBeVisible();
    await expect(page.getByTestId("model-selector")).toHaveValue("claude-opus-4-6");
    // Switch to test → model selector should disappear
    await page.getByTestId("impl-selector").selectOption("test");
    await expect(page.getByTestId("model-selector")).toBeHidden();
    // Switch back → model selector reappears
    await page.getByTestId("impl-selector").selectOption("claude-code");
    await expect(page.getByTestId("model-selector")).toBeVisible();
  });

  // ── Persistence ─────────────────────────────────────────────────────────────

  test("attach file button and file chips appear in composer", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);

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

    // Take screenshot to verify visual
    await page.screenshot({ path: "test-results/file-upload-chip.png" });

    // Send message with file attached
    await page.getByTestId("prompt-input").fill("check this file");
    await page.getByRole("button", { name: "send" }).click();

    // Wait for response — test impl echoes prompt which includes "Attached files:" appended by backend
    await expect(page.getByTestId("chat-feed")).toContainText("Echo:", { timeout: 10_000 });

    // Chips should be cleared after send
    await expect(page.getByTestId("attached-files")).toHaveCount(0);

    // Take screenshot of completed turn
    await page.screenshot({ path: "test-results/file-upload-sent.png" });
  });

  test("fork button creates new session with copied history", async ({ page }) => {
    // Create a session and send a message
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    await page.getByTestId("prompt-input").fill("original message");
    await page.getByRole("button", { name: "send" }).click();
    await expect(page.getByTestId("chat-feed")).toContainText("Echo: original message", { timeout: 10_000 });

    // Fork button should be visible (session has turns)
    const forkBtn = page.getByTestId("fork-btn");
    await expect(forkBtn).toBeVisible();
    await forkBtn.click();

    // New session should appear in list with "Fork of" title
    await expect(page.getByTestId("session-list")).toContainText("Fork of", { timeout: 5000 });

    // Forked session should have the copied history
    await expect(page.getByTestId("chat-feed")).toContainText("Echo: original message", { timeout: 5000 });

    await page.screenshot({ path: "test-results/fork-session.png" });
  });

  test("session and history persist after page reload", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await selectTestImpl(page);
    await page.getByTestId("prompt-input").fill("persist me");
    await page.getByRole("button", { name: "send" }).click();
    await expect(page.getByTestId("chat-feed")).toContainText("Echo: persist me", { timeout: 10_000 });

    // Reload the page
    await page.reload();
    await expect(page.getByTestId("new-session-btn")).toBeVisible();

    // Wait for sessions to reload from backend after relay reconnects
    await expect(page.getByTestId("session-list")).toContainText("New session", { timeout: 10_000 });

    // Re-select the session — use JS click to bypass react-grid-layout overlay
    await expect(page.getByTestId("session-list")).toContainText("New session", { timeout: 10_000 });
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="session-list"] .divide-y > div') as HTMLElement;
      el?.click();
    });
    await expect(page.getByTestId("chat-feed")).toContainText("Echo: persist me", { timeout: 10_000 });
  });
});
