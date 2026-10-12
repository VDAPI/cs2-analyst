/** A new player: register, land in the app, sign out. */
import { expect, test } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("rejestracja, wejście do aplikacji i wylogowanie", async ({ page }, testInfo) => {
  const email = `nowy-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Nazwa").fill("Nowy Gracz");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill("bardzo-tajne-1");
  await page.getByLabel("Powtórz hasło").fill("bardzo-tajne-1");
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/register"));

  // A fresh account sees empty states, not someone else's matches.
  await page.goto("/library");
  await expect(page.getByText("Brak zapisanych analiz")).toBeVisible();

  await page.getByRole("button", { name: "Menu konta" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/matches");
  await expect(page).toHaveURL(/\/login/);
});

test("rejestracja odrzuca różne hasła", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(`inny-${Date.now()}@example.com`);
  await page.getByLabel("Hasło", { exact: true }).fill("bardzo-tajne-1");
  await page.getByLabel("Powtórz hasło").fill("bardzo-tajne-2");
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Hasła nie są takie same" })).toBeVisible();
});
