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

/**
 * Pre-seed localStorage with a single full-width tickets panel.
 */
export async function withTicketsPanel(page: Page): Promise<void> {
  await page.addInitScript((data: { repo: string }) => {
    localStorage.setItem("alf-dashboard", JSON.stringify({
      state: {
        saved: {
          [data.repo]: {
            panels: [{ id: "tickets-0", type: "tickets", args: {} }],
            layout: [{ i: "tickets-0", x: 0, y: 0, w: 12, h: 12, minW: 2, minH: 2 }],
            freeMode: false,
          },
        },
      },
      version: 0,
    }));
  }, { repo: REPO });
}

/**
 * Pre-seed localStorage with a single full-width files panel.
 */
export async function withFilesPanel(page: Page): Promise<void> {
  await page.addInitScript((data: { repo: string }) => {
    localStorage.setItem("alf-dashboard", JSON.stringify({
      state: {
        saved: {
          [data.repo]: {
            panels: [{ id: "files-0", type: "files", args: {} }],
            layout: [{ i: "files-0", x: 0, y: 0, w: 12, h: 12, minW: 2, minH: 2 }],
            freeMode: false,
          },
        },
      },
      version: 0,
    }));
  }, { repo: REPO });
}

/**
 * Pre-seed localStorage with agents + tickets panels side by side (for annotation tests).
 */
export async function withAgentsAndTickets(page: Page): Promise<void> {
  await page.addInitScript((data: { repo: string }) => {
    localStorage.setItem("alf-dashboard", JSON.stringify({
      state: {
        saved: {
          [data.repo]: {
            panels: [
              { id: "agents-0", type: "agents", args: {} },
              { id: "tickets-0", type: "tickets", args: {} },
            ],
            layout: [
              { i: "agents-0", x: 0, y: 0, w: 6, h: 12, minW: 2, minH: 2 },
              { i: "tickets-0", x: 6, y: 0, w: 6, h: 12, minW: 2, minH: 2 },
            ],
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
