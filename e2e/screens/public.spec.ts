/** What a visitor sees without an account: landing page, login, register, the login wall, the example analysis. */
import { expect, expectCanvasPainted, expectNoHorizontalScroll, expectScreen, settle, test } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("strona główna", async ({ page }) => {
  await page.goto("/");
  await expectScreen(page);
  await expect(page.getByRole("link", { name: /Wgraj demo/i }).first()).toBeVisible();
  await settle(page);
  await expectNoHorizontalScroll(page);
  await expect(page).toHaveScreenshot("strona-glowna.png", { mask: [page.locator("canvas")] });
});

test("logowanie", async ({ page }) => {
  await page.goto("/login");
  await expectScreen(page, "Zaloguj się");
  // Steam login is optional: without STEAM_API_KEY there is no Steam button.
  await expect(page.getByRole("button", { name: /Sign in through Steam/i })).toHaveCount(0);
  await settle(page);
  await expectNoHorizontalScroll(page);
  await expect(page).toHaveScreenshot("logowanie.png");
});

test("rejestracja", async ({ page }) => {
  await page.goto("/register");
  await expectScreen(page, "Załóż konto");
  await settle(page);
  await expectNoHorizontalScroll(page);
  await expect(page).toHaveScreenshot("rejestracja.png");
});

for (const doc of [
  { path: "/privacy", heading: "Polityka prywatności", shot: "polityka-prywatnosci.png" },
  { path: "/terms", heading: "Regulamin", shot: "regulamin.png" },
]) {
  test(`dokument: ${doc.heading}`, async ({ page }) => {
    await page.goto(doc.path);
    await expectScreen(page, doc.heading);
    await expect(page.getByRole("note").filter({ hasText: /Szkic/ })).toBeVisible();
    await settle(page);
    await expectNoHorizontalScroll(page);
    await expect(page).toHaveScreenshot(doc.shot, { fullPage: false });
  });
}

test("nagłówki bezpieczeństwa", async ({ page }) => {
  const res = await page.request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("ekran offline", async ({ page }) => {
  await page.goto("/offline");
  await expectScreen(page);
  await expectNoHorizontalScroll(page);
});

test("zalogowane ekrany wymagają logowania", async ({ page }) => {
  for (const path of ["/matches", "/upload", "/library", "/replay", "/settings"]) {
    await page.goto(path);
    await expect(page, `${path} without a session`).toHaveURL(/\/login/);
  }
});

test("złe hasło pokazuje błąd", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e@cs2analyst.local");
  await page.getByLabel("Hasło").fill("zle-haslo-123");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Nieprawidłowy email lub hasło" })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("przykładowa analiza bez logowania", async ({ page }) => {
  // The guide is checked below; here the report itself.
  await page.addInitScript(() => window.localStorage.setItem("cs2a-report-tour", "done"));
  await page.goto("/demo");
  await expectScreen(page, "Raport meczu bez zakładania konta");
  await expect(page.getByText("Rada:").first()).toBeVisible();
  await expect(page.getByText("Ćwiczenie:").first()).toBeVisible();
  // Read-only: no way into the logged-in replay.
  await expect(page.getByRole("link", { name: "Najgorszy moment w replayu" })).toHaveCount(0);
  // The 2D clip of the worst moment loads without an account.
  const clip = page.locator("canvas[aria-label^='Podgląd 2D']").first();
  await clip.scrollIntoViewIfNeeded();
  await expectCanvasPainted(page, "canvas[aria-label^='Podgląd 2D']");
  // Another player's report.
  const other = page.getByRole("navigation", { name: "Raport gracza" }).getByRole("link").nth(1);
  await other.click();
  await expect(page).toHaveURL(/\/demo\?player=\d+/);
  await expect(other).toHaveAttribute("aria-current", "true");
  await page.goto("/demo");
  await settle(page);
  await expectNoHorizontalScroll(page);
  await expect(page).toHaveScreenshot("przyklad.png", { mask: [page.locator("canvas")] });
});

test("przewodnik po przykładowym raporcie", async ({ page }) => {
  await page.goto("/demo");
  const tour = page.getByTestId("report-tour");
  // Opens by itself on the first visit.
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("heading", { name: "Wybierz gracza" })).toBeVisible();
  for (let i = 0; i < 12 && (await tour.getByRole("button", { name: "Dalej" }).count()) > 0; i++) {
    await tour.getByRole("button", { name: "Dalej" }).click();
  }
  await expect(tour.getByRole("heading", { name: "Taki raport dla twoich meczów" })).toBeVisible();
  await tour.getByRole("button", { name: "Gotowe" }).click();
  await expect(tour).toHaveCount(0);
  // Remembered in this browser.
  await page.reload();
  await expect(page.getByText("Rada:").first()).toBeVisible();
  await page.waitForTimeout(600);
  await expect(tour).toHaveCount(0);
});

test("strona główna prowadzi do przykładu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Zobacz przykład" }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
  await expectScreen(page, "Raport meczu bez zakładania konta");
});
