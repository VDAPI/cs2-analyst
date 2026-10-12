/** Getting around: sidebar on desktop, bottom bar and drawer on a phone. */
import { expect, test } from "../fixtures";

test("nawigacja prowadzi do ekranów", async ({ page, isMobile }) => {
  await page.goto("/matches");
  if (isMobile) {
    await page.getByRole("button", { name: /menu/i }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Biblioteka" }).click();
  } else {
    await page.getByRole("navigation").getByRole("link", { name: "Biblioteka" }).first().click();
  }
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("lista meczów otwiera mecz", async ({ page, seed }) => {
  await page.goto("/matches");
  await page.locator(`a[href="/matches/${seed.matchIds[0]}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/matches/${seed.matchIds[0]}$`));
  await expect(page.getByText("e2e_player").first()).toBeVisible();
});
