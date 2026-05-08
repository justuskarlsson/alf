import { test, expect } from "@playwright/test";
import { goToRepo, withTicketsPanel } from "./helpers";

test.describe("Tickets panel", () => {
  test("ticket list renders with items", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();
    // Default filter is "open" — switch to "done" to find T-001
    const select = panel.getByTestId("filter-status");
    await select.selectOption("done");
    await expect(panel.getByText("T-001").first()).toBeVisible();
  });

  test("click a ticket → detail pane shows title and content", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // Switch to "done" to access T-001
    const select = panel.getByTestId("filter-status");
    await select.selectOption("done");
    await panel.getByText("T-001").first().click();
    await expect(panel.getByText("Select a ticket")).not.toBeVisible();
    await expect(panel.getByText("T-001").first()).toBeVisible();
  });

  test("tickets show status badges", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // Default view shows open tickets — should have at least one status badge
    await expect(panel.locator('[data-testid="ticket-status-open"]').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Filtering ──────────────────────────────────────────────────────────────

  test("default filter is open — only open tickets visible", async ({ page }) => {
    await withTicketsPanel(page);
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();

    // Wait for tickets to load
    await expect(panel.getByText(/T-\d{3}/).first()).toBeVisible({ timeout: 5_000 });

    // Only open badges visible — no done or future
    const doneCount = await panel.locator('[data-testid="ticket-status-done"]').count();
    expect(doneCount).toBe(0);
    const futureCount = await panel.locator('[data-testid="ticket-status-future"]').count();
    expect(futureCount).toBe(0);
    const openCount = await panel.locator('[data-testid="ticket-status-open"]').count();
    expect(openCount).toBeGreaterThan(0);
  });

  test("filter dropdown: open → in-progress → future → done → all", async ({ page }) => {
    await withTicketsPanel(page);
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/T-\d{3}/).first()).toBeVisible({ timeout: 5_000 });

    const select = panel.getByTestId("filter-status");

    // Default: "open"
    await expect(select).toHaveValue("open");

    // Select "future"
    await select.selectOption("future");
    await expect(select).toHaveValue("future");
    await expect(panel.locator('[data-testid="ticket-status-future"]').first()).toBeVisible({ timeout: 3_000 });
    expect(await panel.locator('[data-testid="ticket-status-open"]').count()).toBe(0);

    // Select "done"
    await select.selectOption("done");
    await expect(select).toHaveValue("done");
    await expect(panel.locator('[data-testid="ticket-status-done"]').first()).toBeVisible({ timeout: 3_000 });
    expect(await panel.locator('[data-testid="ticket-status-future"]').count()).toBe(0);

    // Select "all"
    await select.selectOption("all");
    await expect(select).toHaveValue("all");
    // All statuses visible
    await expect(panel.locator('[data-testid="ticket-status-done"]').first()).toBeVisible({ timeout: 3_000 });
    await expect(panel.locator('[data-testid="ticket-status-open"]').first()).toBeVisible({ timeout: 3_000 });

    // Back to "open"
    await select.selectOption("open");
    await expect(select).toHaveValue("open");
  });
});
