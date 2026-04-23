import { test, expect } from "@playwright/test";
import { REPO, goToRepo, withAgentsAndTickets, withAgentsPanel } from "./helpers";

test.describe("Annotations", () => {
  test("annotation mode buttons appear in header and toggle", async ({ page }) => {
    await withAgentsPanel(page);
    await goToRepo(page);

    const textBtn = page.getByTestId("annotation-text-btn");
    const voiceBtn = page.getByTestId("annotation-voice-btn");

    await expect(textBtn).toBeVisible();
    await expect(voiceBtn).toBeVisible();

    // Initially neither is active
    await expect(textBtn).not.toHaveClass(/bg-alf-surface/);
    await expect(voiceBtn).not.toHaveClass(/bg-alf-surface/);

    // Click text — toggles on
    await textBtn.click();
    await expect(textBtn).toHaveClass(/bg-alf-surface/);
    await expect(voiceBtn).not.toHaveClass(/bg-alf-surface/);

    // Click text again — toggles off
    await textBtn.click();
    await expect(textBtn).not.toHaveClass(/bg-alf-surface/);

    // Click voice — toggles on
    await voiceBtn.click();
    await expect(voiceBtn).toHaveClass(/bg-alf-surface/);
    await expect(textBtn).not.toHaveClass(/bg-alf-surface/);
  });

  test("text annotation: select ticket text, chip appears in composer", async ({ page }) => {
    await withAgentsAndTickets(page);
    await goToRepo(page);

    // Create a session so the composer is visible
    await page.evaluate(() => { window.prompt = () => "Annotation test"; });
    await page.getByTestId("new-session-btn").click();
    await page.getByTestId("prompt-input").waitFor({ timeout: 5000 });

    // Click a ticket to load its content
    const ticketItem = page.locator("[data-testid='panel-tickets']").locator(".divide-y > div").first();
    await ticketItem.waitFor({ timeout: 5000 });
    await ticketItem.click();

    // Wait for ticket content
    const ticketContent = page.locator("[data-alf-ctx-ticket-id]");
    await ticketContent.waitFor({ timeout: 5000 });

    // Enable text annotation mode
    await page.getByTestId("annotation-text-btn").click();

    // Select some text in ticket — triple click to select a line
    const textTarget = ticketContent.locator("p, li, h2, h3").first();
    await textTarget.waitFor({ timeout: 3000 });
    await textTarget.click({ clickCount: 3 });

    // Annotation popover should appear
    const popover = page.locator("[data-annotation-popover]");
    await expect(popover).toBeVisible({ timeout: 3000 });

    // Type annotation and commit
    const annotationInput = popover.locator("input");
    await annotationInput.fill("important note");
    await annotationInput.press("Enter");

    // Popover dismissed
    await expect(popover).not.toBeVisible();

    // Annotation chip visible in composer area
    const chips = page.getByTestId("annotation-chips");
    await expect(chips).toBeVisible({ timeout: 3000 });
    await expect(chips).toContainText("important note");
  });

  test("annotation chip can be removed by clicking x", async ({ page }) => {
    await withAgentsAndTickets(page);
    await goToRepo(page);

    // Create session
    await page.evaluate(() => { window.prompt = () => "Remove test"; });
    await page.getByTestId("new-session-btn").click();
    await page.getByTestId("prompt-input").waitFor({ timeout: 5000 });

    // Load ticket
    const ticketItem = page.locator("[data-testid='panel-tickets']").locator(".divide-y > div").first();
    await ticketItem.waitFor({ timeout: 5000 });
    await ticketItem.click();
    const ticketContent = page.locator("[data-alf-ctx-ticket-id]");
    await ticketContent.waitFor({ timeout: 5000 });

    // Enable text mode + select + annotate
    await page.getByTestId("annotation-text-btn").click();
    const textTarget = ticketContent.locator("p, li, h2, h3").first();
    await textTarget.waitFor({ timeout: 3000 });
    await textTarget.click({ clickCount: 3 });

    const popover = page.locator("[data-annotation-popover]");
    await expect(popover).toBeVisible({ timeout: 3000 });
    await popover.locator("input").fill("delete me");
    await popover.locator("input").press("Enter");

    // Chip visible
    const chips = page.getByTestId("annotation-chips");
    await expect(chips).toBeVisible({ timeout: 3000 });

    // Click remove button
    await chips.locator("button").first().click();

    // Chips gone
    await expect(chips).not.toBeVisible();
  });

  test("mic button visible in composer", async ({ page }) => {
    await withAgentsPanel(page);
    await goToRepo(page);

    await page.evaluate(() => { window.prompt = () => "mic test"; });
    await page.getByTestId("new-session-btn").click();
    await page.getByTestId("prompt-input").waitFor({ timeout: 5000 });

    const micBtn = page.getByTestId("mic-btn");
    await expect(micBtn).toBeVisible();
  });
});
