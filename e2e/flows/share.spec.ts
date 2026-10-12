/** A public report link opens without an account. */
import { expect, test } from "../fixtures";

test("udostępniony raport działa bez logowania", async ({ page, browser, seed }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/report/${seed.matchIds[0]}`);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/shares") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Udostępnij" }).first().click();
  const res = await created;
  expect(res.ok()).toBe(true);
  const { path } = (await res.json()) as { path: string };
  expect(path).toMatch(/^\/s\/[\w-]+$/);

  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await visitor.newPage();
  await guest.goto(path);
  await expect(guest.getByText("Udostępniony raport")).toBeVisible();
  await expect(guest.getByText("Rada:").first()).toBeVisible();
  await visitor.close();
});

test("publiczny profil gracza", async ({ page, browser }, testInfo) => {
  const slug = `e2e-${testInfo.project.name}`;
  const res = await page.request.patch("/api/user/public-profile", { data: { enabled: true, slug } });
  expect(res.ok()).toBe(true);
  const { path } = (await res.json()) as { path: string };

  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await visitor.newPage();
  await guest.goto(path);
  await expect(guest.locator("h1").first()).toBeVisible();
  await expect(guest.getByText("E2E Gracz").first()).toBeVisible();
  await visitor.close();

  // Off again: the page is gone for everyone.
  await page.request.patch("/api/user/public-profile", { data: { enabled: false, slug } });
  const gone = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const after = await (await gone.newPage()).goto(path);
  expect(after?.status()).toBe(404);
  await gone.close();
});
