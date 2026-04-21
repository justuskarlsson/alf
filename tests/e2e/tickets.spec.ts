import { test, expect } from "@playwright/test";
import { goToRepo } from "./helpers";

test.describe("Tickets panel", () => {
  test("ticket list renders with items", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    await expect(panel).toBeVisible();
    // MVP3 tickets should be present (T-001 through T-008)
    await expect(panel.getByText("T-001").first()).toBeVisible();
  });

  test("click a ticket → detail pane shows title and content", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // Click the first ticket item
    await panel.getByText("T-001").first().click();
    // Detail pane should now show markdown content (no longer the empty state)
    await expect(panel.getByText("Select a ticket")).not.toBeVisible();
    // The ticket title or ID appears in the detail header
    await expect(panel.getByText("T-001").first()).toBeVisible();
  });

  test("tickets show status badges", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // At least one status badge is visible (open or done)
    const hasDone = await panel.getByText("done").first().isVisible().catch(() => false);
    const hasOpen = await panel.getByText("open").first().isVisible().catch(() => false);
    expect(hasDone || hasOpen).toBeTruthy();
  });

  test("done tickets show in list", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-tickets"]');
    // T-001 through T-006 and T-008 are done
    await expect(panel.getByText("done").first()).toBeVisible();
  });
});
