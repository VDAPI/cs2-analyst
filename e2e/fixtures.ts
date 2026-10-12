/**
 * Shared test fixture: every spec fails on an uncaught page error or a
 * console error, so a screen that renders but throws in the browser is
 * still a failing test. `seed` holds the ids written by the seed script.
 */
import { readFileSync } from "node:fs";
import { expect, test as base, type Page } from "@playwright/test";
import { SEED_STATE_FILE, type SeedState } from "./env";

/** Console noise that is not an app error. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  // A resource the browser could not load is reported by the network, not the app.
  /Failed to load resource/,
  // Next aborts a link prefetch when the test navigates away first.
  /Failed to fetch RSC payload/,
  // next-auth's session poll cut off by a navigation (e.g. right after sign-out).
  /CLIENT_FETCH_ERROR[\s\S]*Failed to fetch/,
];

export const test = base.extend<{ seed: SeedState; pageErrors: string[] }>({
  seed: async ({}, use) => {
    await use(JSON.parse(readFileSync(SEED_STATE_FILE, "utf8")) as SeedState);
  },
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
        errors.push(`console.error: ${text}`);
      });
      await use(errors);
      expect(errors, "the page logged errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The screen rendered without an error page and has its title. */
export async function expectScreen(page: Page, heading?: string | RegExp) {
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
  const h1 = page.locator("h1").first();
  await expect(h1).toBeVisible();
  if (heading) await expect(h1).toContainText(heading);
}

/** Mobile rule: nothing makes the page itself scroll sideways. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, view: doc.clientWidth };
  });
  expect(overflow.scroll, `page is ${overflow.scroll}px wide in a ${overflow.view}px viewport`).toBeLessThanOrEqual(
    overflow.view
  );
}

/** Wait until fonts are in and the network is quiet, so screenshots are stable. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

/** The canvas has actually been drawn on (radar, players, heat), not left blank. */
export async function expectCanvasPainted(page: Page, selector = "canvas") {
  const canvas = page.locator(selector).first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(
      () =>
        canvas.evaluate((c: HTMLCanvasElement) => {
          const ctx = c.getContext("2d");
          if (!ctx || c.width === 0 || c.height === 0) return 0;
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          let lit = 0;
          for (let i = 0; i < data.length; i += 4 * 61) {
            if (data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] > 40) lit++;
          }
          return lit;
        }),
      { message: "canvas stays blank" }
    )
    .toBeGreaterThan(100);
}
