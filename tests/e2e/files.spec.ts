import { test, expect } from "@playwright/test";
import { goToRepo, withFilesPanel } from "./helpers";

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

  test("click an image file → renders image preview", async ({ page }) => {
    await withFilesPanel(page);
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-files"]');
    await expect(panel.getByRole("tree")).toBeVisible();

    // test-image.png is at repo root (tracked, easily accessible)
    const imageFile = panel.getByText("test-image.png");
    await expect(imageFile).toBeVisible();
    await imageFile.click();

    // Image preview should render
    const preview = panel.locator('[data-testid="image-preview"]');
    await expect(preview).toBeVisible();
    const img = preview.locator("img");
    await expect(img).toBeVisible();
    await page.screenshot({ path: "test-results/image-preview.png" });
  });

  test("show hidden toggle reveals gitignored files", async ({ page }) => {
    await withFilesPanel(page);
    await goToRepo(page);
    const panel = page.locator('[data-testid="panel-files"]');
    await expect(panel.getByRole("tree")).toBeVisible();

    // test-results/ is gitignored, so NOT visible by default (git ls-files mode)
    await expect(panel.getByText("test-results")).not.toBeVisible();

    // Click "show hidden" toggle
    const toggle = panel.locator('[data-testid="show-hidden-toggle"]');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Wait for file list refresh — test-results/ directory should appear (naive walker mode)
    await expect(panel.getByText("test-results")).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "test-results/show-hidden.png" });

    // Toggle back — test-results should disappear
    await toggle.click();
    await expect(panel.getByText("test-results")).not.toBeVisible({ timeout: 5000 });
  });
});
