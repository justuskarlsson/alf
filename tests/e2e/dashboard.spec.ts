import { test, expect } from "@playwright/test";
import { goToRepo } from "./helpers";

test.describe("Dashboard", () => {
  test("loads default four panels (Agents, Files, Tickets, Git)", async ({ page }) => {
    await goToRepo(page);
    await expect(page.locator('[data-testid="panel-agents"]')).toBeVisible();
    await expect(page.locator('[data-testid="panel-files"]')).toBeVisible();
    await expect(page.locator('[data-testid="panel-tickets"]')).toBeVisible();
    await expect(page.locator('[data-testid="panel-git"]')).toBeVisible();
  });

  test("unlock → add second Files panel → panel appears", async ({ page }) => {
    await goToRepo(page);
    await page.getByTitle("Unlock layout").click();
    // Add a second files panel (all 4 types already in default layout)
    const panelsBefore = await page.locator('[data-testid^="panel-files"]').count();
    await page.locator("select").filter({ hasText: "Add panel" }).selectOption("files");
    await expect(page.locator('[data-testid^="panel-files"]')).toHaveCount(panelsBefore + 1);
  });

  test("remove panel in free mode reduces panel count", async ({ page }) => {
    await goToRepo(page);
    await page.getByTitle("Unlock layout").click();

    const removeBtns = page.getByTitle("Remove panel");
    await expect(removeBtns).toHaveCount(4);
    await removeBtns.first().click();
    await expect(removeBtns).toHaveCount(3);
  });

  test("drag a panel to a new position", async ({ page }) => {
    await goToRepo(page);
    await page.getByTitle("Unlock layout").click();

    const handles = page.locator(".panel-drag-handle");
    const first = handles.first();
    const last  = handles.last();

    const before = await first.boundingBox();
    await first.dragTo(last);
    const after = await first.boundingBox();

    // Panel should have moved
    expect(after?.y).not.toEqual(before?.y);
  });

  test("resize a panel via its resize handle", async ({ page }) => {
    await goToRepo(page);
    await page.getByTitle("Unlock layout").click();

    const panel = page.locator(".react-grid-item").first();
    const before = await panel.boundingBox();
    const handle = panel.locator(".react-resizable-handle-se").first();
    const hBox   = await handle.boundingBox();
    if (!hBox || !before) throw new Error("No bounding box");

    const cx = hBox.x + hBox.width / 2;
    const cy = hBox.y + hBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 80, { steps: 10 });
    await page.mouse.up();

    const after = await panel.boundingBox();
    expect(after?.width).toBeGreaterThan(before.width);
  });
});
