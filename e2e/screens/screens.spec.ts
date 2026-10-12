/**
 * Every screen on main renders for a logged-in player, at 1280 px and at
 * 360 px: no error page, no browser errors, its title, no sideways page
 * scroll, and a screenshot compared with the committed baseline.
 */
import type { Locator, Page } from "@playwright/test";
import type { SeedState } from "../env";
import { expect, expectNoHorizontalScroll, expectScreen, settle, test } from "../fixtures";

interface Screen {
  name: string;
  path: (s: SeedState) => string;
  heading?: RegExp;
  /** Parts that depend on today's date (monthly limits, last refresh), masked in the screenshot. */
  volatile?: (page: Page) => Locator[];
  /** No screenshot: the screen is mostly "today" numbers (still checked for errors and layout). */
  noScreenshot?: boolean;
}

const monthlyLimit = (page: Page) => [page.getByText(/W tym miesiącu/i).locator("..")];
const lastRefresh = (page: Page) => [page.getByText(/Ostatnie przeliczenie/)];

const SCREENS: Screen[] = [
  { name: "mecze", path: () => "/matches" },
  { name: "mecz", path: (s) => `/matches/${s.matchIds[0]}` },
  { name: "raporty", path: () => "/report" },
  { name: "raport", path: (s) => `/report/${s.matchIds[0]}` },
  { name: "postep", path: () => "/progress" },
  // The weekly plan is built for the current week: checked, not screenshotted.
  { name: "trener", path: () => "/coach", noScreenshot: true },
  // Today's day of that plan: same reason.
  { name: "trening", path: () => "/training", noScreenshot: true },
  { name: "upload", path: () => "/upload", volatile: (page) => [page.getByText(/Zostało \d+/)] },
  { name: "kolejka", path: () => "/queue" },
  { name: "biblioteka", path: () => "/library", volatile: monthlyLimit },
  { name: "premier", path: () => "/premier" },
  { name: "gracze", path: () => "/players" },
  { name: "gracz", path: (s) => `/players/${s.playerSteamId}` },
  { name: "porownanie", path: () => "/compare" },
  { name: "porownanie-graczy", path: (s) => `/compare/${s.playerSteamId}/vs/${s.opponentSteamId}` },
  { name: "replay-lista", path: () => "/replay" },
  { name: "replay", path: (s) => `/replay/${s.matchIds[0]}` },
  { name: "heatmapy", path: () => "/heatmaps" },
  { name: "heatmapa-meczu", path: (s) => `/heatmaps/${s.matchIds[0]}` },
  { name: "heatmapa-mapy", path: () => "/heatmaps/map/de_mirage" },
  { name: "granaty", path: () => "/grenades" },
  { name: "granaty-meczu", path: (s) => `/grenades/${s.matchIds[0]}` },
  { name: "lineupy", path: () => "/lineups" },
  { name: "ekonomia", path: () => "/economy" },
  { name: "ekonomia-meczu", path: (s) => `/economy/${s.matchIds[0]}` },
  { name: "mechanika", path: (s) => `/mechanics/${s.matchIds[0]}` },
  { name: "scouting", path: () => "/scouting" },
  { name: "pro", path: () => "/pro", volatile: lastRefresh },
  { name: "graj-jak-pro", path: () => "/play-like-pro?map=de_mirage&side=T" },
  { name: "ustawienia", path: () => "/settings" },
  { name: "admin", path: () => "/admin", noScreenshot: true },
  { name: "admin-analizy", path: () => "/admin/analyses" },
  { name: "admin-uzytkownicy", path: () => "/admin/users", noScreenshot: true },
  { name: "admin-pro", path: () => "/admin/pro", volatile: lastRefresh },
];

for (const screen of SCREENS) {
  test(`ekran: ${screen.name}`, async ({ page, seed }) => {
    await page.goto(screen.path(seed));
    await expectScreen(page, screen.heading);
    await settle(page);
    await expectNoHorizontalScroll(page);
    if (screen.noScreenshot) return;
    await expect(page).toHaveScreenshot(`${screen.name}.png`, {
      // Canvases (replay, heatmaps) are checked by their own specs.
      mask: [page.locator("canvas"), ...(screen.volatile?.(page) ?? [])],
    });
  });
}
