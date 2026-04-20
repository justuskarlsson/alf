import { test, expect } from "@playwright/test";
import { goToRepo, withAgentsPanel } from "./helpers";

// The test impl emits:
//   thinking: "Analysing the request... Forming a plan. Ready."
//   tool:     "read_file: <repo>/README.md"
//   text:     "Echo: <prompt>"  (word by word)
// Each activity chunk has a ~50ms delay → full turn ~250ms.

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
    await page.getByTestId("prompt-input").fill("hello world");
    await page.getByRole("button", { name: "send" }).click();

    // Pending prompt shown right away (before any server response)
    await expect(page.getByTestId("chat-feed")).toContainText("hello world");
    // Input is cleared and disabled while running
    await expect(page.getByTestId("prompt-input")).toBeDisabled();
  });

  test("streaming — live thinking activity appears while running", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await page.getByTestId("prompt-input").fill("stream test");
    await page.getByRole("button", { name: "send" }).click();

    // Thinking chunks stream in — "Analysing" is first chunk
    await expect(page.getByTestId("chat-feed")).toContainText("Analysing", { timeout: 5_000 });
  });

  test("full turn — all three activity types persist after completion", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
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
    await page.getByTestId("prompt-input").fill("ping");
    await page.getByRole("button", { name: "send" }).click();

    await expect(page.getByTestId("chat-feed")).toContainText("Echo: ping", { timeout: 10_000 });
    await expect(page.getByTestId("prompt-input")).toBeEnabled();
  });

  test("Enter key sends message (not Shift+Enter)", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
    await page.getByTestId("prompt-input").fill("enter key test");
    await page.getByTestId("prompt-input").press("Enter");
    await expect(page.getByTestId("chat-feed")).toContainText("enter key test");
  });

  test("Shift+Enter inserts newline instead of sending", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
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

  // ── Persistence ─────────────────────────────────────────────────────────────

  test("session and history persist after page reload", async ({ page }) => {
    await page.getByTestId("new-session-btn").click();
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
