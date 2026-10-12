/** A new player: register, land in the app, sign out; download the data and delete the account (S29). */
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

async function register(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.getByLabel("Nazwa").fill("Nowy Gracz");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByLabel("Powtórz hasło").fill(password);
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/register"));
}

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

  // A fresh account starts with the three steps (S21) and empty states, not someone else's matches.
  await page.goto("/matches");
  const start = page.getByTestId("getting-started");
  await expect(start).toBeVisible();
  await expect(start.getByRole("link", { name: "Zobacz przykładowy raport" })).toHaveAttribute("href", "/demo");
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

test("eksport danych i usunięcie konta", async ({ page }, testInfo) => {
  const email = `rodo-${testInfo.project.name}-${Date.now()}@example.com`;
  const password = "bardzo-tajne-1";
  await register(page, email, password);

  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Pobierz dane (JSON)" }).click();
  const file = await (await download).path();
  const data = JSON.parse(await readFile(file, "utf8")) as { format: string; profile: { email: string; password?: unknown } };
  expect(data.format).toBe("cs2-analyst-export");
  expect(data.profile.email).toBe(email);
  expect(data.profile).not.toHaveProperty("password");

  await page.getByRole("button", { name: "Usuń konto" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Usuń konto na zawsze" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Wpisz USUŃ, aby potwierdzić").fill("USUŃ");
  await dialog.getByLabel("Hasło").fill("zle-haslo-123");
  await confirm.click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Nieprawidłowe hasło" })).toBeVisible();
  await dialog.getByLabel("Hasło").fill(password);
  await confirm.click();
  await page.waitForURL((url) => url.pathname === "/");

  // The account is gone: its password no longer signs in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Nieprawidłowy email lub hasło" })).toBeVisible();
});
