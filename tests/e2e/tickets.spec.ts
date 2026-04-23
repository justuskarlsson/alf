import { test, expect } from "@playwright/test";
import { goToRepo, withTicketsPanel } from "./helpers";

test.describe("Tickets panel", () => {
  test("ticket list renders with items", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();
    // Default filter is "open" — cycle to "done" (open → future → done) to find T-001
    const btn = panel.getByTestId("filter-status");
    await btn.click(); // open → future
    await btn.click(); // future → done
    await expect(panel.getByText("T-001").first()).toBeVisible();
  });

  test("click a ticket → detail pane shows title and content", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // Cycle to "done" to access T-001
    const btn = panel.getByTestId("filter-status");
    await btn.click(); // open → future
    await btn.click(); // future → done
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

  test("cycling filter: open → future → done → all", async ({ page }) => {
    await withTicketsPanel(page);
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/T-\d{3}/).first()).toBeVisible({ timeout: 5_000 });

    const btn = panel.getByTestId("filter-status");

    // Default: "open"
    await expect(btn).toHaveText("open");

    // Click → "future"
    await btn.click();
    await expect(btn).toHaveText("future");
    await expect(panel.locator('[data-testid="ticket-status-future"]').first()).toBeVisible({ timeout: 3_000 });
    expect(await panel.locator('[data-testid="ticket-status-open"]').count()).toBe(0);

    // Click → "done"
    await btn.click();
    await expect(btn).toHaveText("done");
    await expect(panel.locator('[data-testid="ticket-status-done"]').first()).toBeVisible({ timeout: 3_000 });
    expect(await panel.locator('[data-testid="ticket-status-future"]').count()).toBe(0);

    // Click → "all"
    await btn.click();
    await expect(btn).toHaveText("all");
    // All statuses visible
    await expect(panel.locator('[data-testid="ticket-status-done"]').first()).toBeVisible({ timeout: 3_000 });
    await expect(panel.locator('[data-testid="ticket-status-open"]').first()).toBeVisible({ timeout: 3_000 });

    // Click → back to "open"
    await btn.click();
    await expect(btn).toHaveText("open");
  });
});
