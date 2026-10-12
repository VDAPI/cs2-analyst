/** What a visitor sees without an account: landing page, login, register, the login wall. */
import { expect, expectNoHorizontalScroll, expectScreen, settle, test } from "../fixtures";

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
