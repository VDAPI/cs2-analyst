/** Team (S17): a new tactic board is saved with its steps, and a rival is scouted from a team match. */
import { expect, expectScreen, test } from "../fixtures";

test("tablica taktyczna zapisuje kroki", async ({ page, seed }, testInfo) => {
  const name = `Execute A ${testInfo.project.name}`;
  await page.goto(`/team/${seed.teamId}/boards`);
  await page.getByLabel("Nazwa").fill(name);
  await page.getByRole("button", { name: "Utwórz tablicę" }).click();
  await page.waitForURL(/\/boards\/[\w-]+$/);
  await expectScreen(page, name);

  // A smoke on the map, a second step, save.
  await page.getByRole("button", { name: "Smoke" }).click();
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await page.getByRole("button", { name: "Krok", exact: true }).click();
  await expect(page.getByRole("tab", { name: "2" })).toBeVisible();
  const saved = page.waitForResponse((r) => /\/api\/teams\/[\w-]+\/boards\/[\w-]+$/.test(r.url()) && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Zapisz" }).click();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(page.getByRole("tab", { name: "2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zapisano" })).toBeDisabled();
});

test("scouting rywala z meczu drużyny", async ({ page, seed }) => {
  await page.goto(`/team/${seed.teamId}/rivals`);
  await page.getByRole("button", { name: "Scoutuj tę drużynę" }).first().click();
  await page.waitForURL(/\/rivals\/[\w-]+$/);
  await expectScreen(page);
  await expect(page.getByText("Strona T").first()).toBeVisible();
  await expect(page.getByText("Strona CT").first()).toBeVisible();
});
