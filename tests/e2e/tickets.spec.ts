import { test, expect } from "@playwright/test";
import { goToRepo, withTicketsPanel } from "./helpers";

test.describe("Tickets panel", () => {
  test("ticket list renders with items", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();
    // Default filter hides done tickets — show them to find T-001
    await panel.getByTestId("filter-show-done").click();
    await expect(panel.getByText("T-001").first()).toBeVisible();
  });

  test("click a ticket → detail pane shows title and content", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // Show done tickets to access T-001
    await panel.getByTestId("filter-show-done").click();
    await panel.getByText("T-001").first().click();
    await expect(panel.getByText("Select a ticket")).not.toBeVisible();
    await expect(panel.getByText("T-001").first()).toBeVisible();
  });

  test("tickets show status badges", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // Default view shows open tickets — should have at least one "open" badge
    await expect(panel.locator('[data-testid="ticket-status-open"]').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Filtering ──────────────────────────────────────────────────────────────

  test("done tickets are hidden by default", async ({ page }) => {
    await withTicketsPanel(page);
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();

    // Wait for tickets to load
    await expect(panel.getByText(/T-\d{3}/).first()).toBeVisible({ timeout: 5_000 });

    // "done" status badges should NOT be visible by default
    const doneCount = await panel.locator('[data-testid="ticket-status-done"]').count();
    expect(doneCount).toBe(0);

    // But "open" tickets should be visible
    const openCount = await panel.locator('[data-testid="ticket-status-open"]').count();
    expect(openCount).toBeGreaterThan(0);
  });

  test("filter toggle shows done tickets when enabled", async ({ page }) => {
    await withTicketsPanel(page);
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/T-\d{3}/).first()).toBeVisible({ timeout: 5_000 });

    // Click the filter toggle to show done tickets
    await panel.getByTestId("filter-show-done").click();

    // Now done tickets should be visible
    await expect(panel.locator('[data-testid="ticket-status-done"]').first()).toBeVisible({ timeout: 3_000 });
  });
});
