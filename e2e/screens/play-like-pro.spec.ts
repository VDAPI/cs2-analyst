/** S24: the report names the player's role, and "play like a pro" compares them with a pro from the pool. */
import { expect, expectCanvasPainted, test } from "../fixtures";

test("raport mówi, jaką rolę grał gracz, i prowadzi do porównania z pro", async ({ page, seed }) => {
  await page.goto(`/report/${seed.matchIds[0]}`);
  const card = page.getByTestId("role-card");
  await expect(card).toBeVisible();
  await expect(card.getByText(/^Grałeś jako .+ na Mirage$/)).toBeVisible();
  await expect(card.getByRole("table")).toBeVisible();
  await card.getByRole("link", { name: /Porównaj z zawodowcem/ }).click();
  await expect(page).toHaveURL(/\/play-like-pro\?map=de_mirage/);
  await expect(page.getByRole("heading", { level: 1, name: "Graj jak pro" })).toBeVisible();
});

test("graj jak pro: metryki, timing i pozycje obok zawodowca", async ({ page }) => {
  await page.goto("/play-like-pro?map=de_mirage&side=T");
  const pick = page.getByLabel("Zawodowiec");
  await expect(pick).toBeVisible();
  expect(await pick.locator("option").count()).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Metryki roli" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timing i ustawienie" })).toBeVisible();
  await expectCanvasPainted(page, "[aria-label^='Pozycje 20 s'] canvas");

  // Switching sides keeps the pro and the map.
  await page.getByRole("radio", { name: "CT" }).click();
  await expect(page).toHaveURL(/side=CT/);
  await expect(page).toHaveURL(/map=de_mirage/);
});
