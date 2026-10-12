/** S24: a pro picked as favourite stays selected on the next visit. */
import { expect, test } from "../fixtures";

test("ulubiony zawodowiec zostaje zapamiętany", async ({ page }, testInfo) => {
  // One favourite per account: the desktop and mobile runs share it, so only one of them changes it.
  test.skip(testInfo.project.name !== "desktop-flows", "the favourite is per account");
  await page.goto("/play-like-pro");
  const pick = page.getByLabel("Zawodowiec");
  const options = pick.locator("option");
  const last = (await options.count()) - 1;
  const steamId = await options.nth(last).getAttribute("value");
  await pick.selectOption(steamId!);
  await expect(page).toHaveURL(new RegExp(`pro=${steamId}`));

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/user/favorite-pro") && r.ok());
  await page.getByRole("button", { name: "Ustaw jako ulubionego" }).click();
  await saved;

  await page.goto("/play-like-pro");
  await expect(pick).toHaveValue(steamId!);
  await expect(page.getByRole("button", { name: "Ulubiony" })).toBeDisabled();
});
