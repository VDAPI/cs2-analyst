/** S25: a 2D clip downloads as a GIF and opens through a public link; an invite link adds a friend to the ranking. */
import type { Browser } from "@playwright/test";
import { expect, test } from "../fixtures";

test("klip 2D: pobranie GIF i publiczny link do klipu", async ({ page, browser }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/clips?tab=mistakes");
  const card = page.locator("article").first();
  await expect(card).toBeVisible();
  // The first cards load their clip as they scroll in; the controls appear once the frames are there.
  await card.getByRole("button", { name: "Pobierz klip" }).click({ timeout: 30_000 });
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await card.getByRole("button", { name: "GIF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^cs2-analyst-[a-z0-9-]+\.gif$/);
  const stream = await file.createReadStream();
  const head: Buffer = await new Promise((resolve, reject) => {
    stream.once("readable", () => resolve(stream.read(6) as Buffer));
    stream.once("error", reject);
  });
  expect(head.toString("latin1")).toBe("GIF89a");

  const created = page.waitForResponse((r) => r.url().endsWith("/api/shares") && r.request().method() === "POST");
  await card.getByRole("button", { name: "Udostępnij klip" }).click();
  const res = await created;
  expect(res.ok()).toBe(true);
  const { path } = (await res.json()) as { path: string };

  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await visitor.newPage();
  await guest.goto(path);
  await expect(guest.getByText("Udostępniony klip")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Pobierz klip" })).toBeVisible({ timeout: 30_000 });
  await visitor.close();
});

async function registerFriend(browser: Browser, email: string) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto("/register");
  await page.getByLabel("Nazwa").fill("Kumpel E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill("kumpel-haslo-1");
  await page.getByLabel("Powtórz hasło").fill("kumpel-haslo-1");
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/register"));
  return { ctx, page };
}

test("znajomi: link zaproszenia dodaje znajomego do rankingu", async ({ page, browser }, testInfo) => {
  const res = await page.request.post("/api/friends/code", { data: {} });
  expect(res.ok()).toBe(true);
  const { path } = (await res.json()) as { path: string };
  expect(path).toMatch(/^\/friends\/add\/[\w-]{12}$/);

  const friend = await registerFriend(browser, `kumpel-${testInfo.project.name}-${Date.now()}@example.com`);
  await friend.page.goto(path);
  await expect(friend.page.getByText("E2E Gracz").first()).toBeVisible();
  await friend.page.getByRole("button", { name: "Dodaj do znajomych" }).click();
  await friend.page.waitForURL((url) => url.pathname === "/friends");
  await expect(friend.page.getByText("E2E Gracz").first()).toBeVisible();
  await friend.ctx.close();

  // The inviter sees the friend in the list and a place in the ranking.
  await page.goto("/friends");
  await expect(page.getByText("Kumpel E2E").first()).toBeVisible();
  await expect(page.getByText("Twoje miejsce:")).toBeVisible();

  // Remove again, so the other project's run starts from the same state.
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: /Usuń: Kumpel E2E/ }).first().click();
  await expect(page.getByText("Kumpel E2E")).toHaveCount(0);
});
