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
    const allChanges = panel.locator('[data-testid="git-all-changes"]');
    if (!await allChanges.isVisible().catch(() => false)) {
      test.skip(); // nothing to diff — clean repo
      return;
    }
    await allChanges.click();
    // Wait for loading to finish — either diff view or "No changes" appears
    await expect(panel.locator(".alf-diff, :text('No changes')").first()).toBeVisible({ timeout: 5_000 });
  });

  test("diff sidebar sections are scrollable when overflowing", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-git"]');
    // The sidebar scrollable wrapper (parent of CollapsibleSections) should allow scroll
    const diffsBtn = panel.getByRole("button", { name: /diffs/i });
    // Walk up: button -> CollapsibleSection wrapper -> scrollable container
    const scrollContainer = diffsBtn.locator("../..");
    const overflowY = await scrollContainer.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.overflowY;
    });
    // Should be 'auto' or 'scroll', not 'hidden' or 'visible'
    expect(["auto", "scroll"]).toContain(overflowY);
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
