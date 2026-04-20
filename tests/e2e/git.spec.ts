import { test, expect } from "@playwright/test";
import { goToRepo } from "./helpers";

test.describe("Git panel", () => {
  test("git panel renders with sidebar sections", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-git"]');
    await expect(panel).toBeVisible();
    // Collapsible sections "Diffs" and "Worktrees" should appear
    await expect(panel.getByRole("button", { name: /diffs/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: /worktrees/i })).toBeVisible();
  });

  test("diff sidebar shows changed files or empty state", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-git"]');
    // Either "All changes" row is present (with files), or "No changes" shown
    const hasChanges = await panel.getByText("All changes").isVisible().catch(() => false);
    const noChanges  = await panel.getByText("No changes").isVisible().catch(() => false);
    expect(hasChanges || noChanges).toBeTruthy();
  });

  test("click All changes loads diff view", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-git"]');
    const allChanges = panel.getByText("All changes");
    if (!await allChanges.isVisible().catch(() => false)) {
      test.skip(); // nothing to diff — clean repo
      return;
    }
    await allChanges.click();
    // Diff view appears (file headers) or "No changes" if diff is empty
    const diffVisible = await panel.locator(".react-diff-viewer").isVisible().catch(() => false);
    const noneVisible = await panel.getByText("No changes").isVisible().catch(() => false);
    expect(diffVisible || noneVisible).toBeTruthy();
  });

  test("worktrees section can be collapsed and expanded", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-git"]');
    const worktreesBtn = panel.getByRole("button", { name: /worktrees/i });
    // Arrow indicator: ▾ = open, ▸ = collapsed
    const arrow = worktreesBtn.locator("span").first();
    await expect(arrow).toContainText("▾"); // starts open
    await worktreesBtn.click(); // collapse
    await expect(arrow).toContainText("▸");
    await worktreesBtn.click(); // re-expand
    await expect(arrow).toContainText("▾");
  });
});
