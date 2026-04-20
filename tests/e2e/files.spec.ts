import { test, expect } from "@playwright/test";
import { goToRepo } from "./helpers";

test.describe("Files panel", () => {
  test("file tree renders and shows tracked files", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-files"]');
    await expect(panel).toBeVisible();
    // react-arborist renders role=tree
    await expect(panel.getByRole("tree")).toBeVisible();
    // At least one tree item (file or folder) is present
    await expect(panel.getByRole("treeitem").first()).toBeVisible();
  });

  test("click a file → content appears in viewer", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-files"]');
    // CLAUDE.md is a top-level tracked file in this repo
    const fileItem = panel.getByText("CLAUDE.md");
    await expect(fileItem).toBeVisible();
    await fileItem.click();
    // Content viewer should show something (not the empty state)
    await expect(panel.getByText("Select a file")).not.toBeVisible();
    // A <pre> or code block appears with file content
    await expect(panel.locator("pre, code").first()).toBeVisible();
  });

  test("CollapsibleSection — files section can be collapsed and expanded", async ({ page }) => {
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-files"]');
    // "Files" section button collapses the tree
    const sectionBtn = panel.getByRole("button", { name: /files/i }).first();
    await sectionBtn.click(); // collapse
    await expect(panel.getByRole("tree")).not.toBeVisible();
    await sectionBtn.click(); // expand again
    await expect(panel.getByRole("tree")).toBeVisible();
  });
});
