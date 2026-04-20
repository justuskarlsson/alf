import type { Page } from "@playwright/test";

export const REPO = process.env.TEST_REPO ?? "alf";

/**
 * Pre-seed localStorage so the agents panel is already in the dashboard
 * when the page loads. Must be called before page.goto().
 */
export async function withAgentsPanel(page: Page): Promise<void> {
  await page.addInitScript((data: { repo: string }) => {
    localStorage.setItem("alf-dashboard", JSON.stringify({
      state: {
        saved: {
          [data.repo]: {
            panels: [{ id: "agents-0", type: "agents", args: {} }],
            layout: [{ i: "agents-0", x: 0, y: 0, w: 12, h: 12, minW: 2, minH: 2 }],
            freeMode: false,
          },
        },
      },
      version: 0,
    }));
  }, { repo: REPO });
}

export async function goToRepo(page: Page): Promise<void> {
  await page.goto(`/${REPO}`);
}
