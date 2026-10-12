/** Picking two players on /compare opens their head-to-head. */
import { expect, test } from "../fixtures";

test("porównanie dwóch graczy", async ({ page }) => {
  await page.goto("/compare");
  const search = page.getByLabel("Szukaj gracza");
  await search.fill("e2e_player");
  await page.getByRole("button", { name: /e2e_player/ }).click();
  await search.fill("rywal_1");
  await page.getByRole("button", { name: /rywal_1/ }).first().click();
  await page.getByRole("button", { name: "Porównaj" }).click();
  await expect(page).toHaveURL(/\/compare\/\d+\/vs\/\d+/);
  await expect(page.getByText("e2e_player").first()).toBeVisible();
  await expect(page.getByText("rywal_1").first()).toBeVisible();
});
