/** 2D replay from the DB (the .dem is gone after analysis) and the other tool canvases. */
import { expect, expectCanvasPainted, test } from "../fixtures";

test("replay odtwarza rundę i przełącza rundy", async ({ page, seed }) => {
  const matchId = seed.matchIds[0];
  await page.goto(`/replay/${matchId}`);
  await expectCanvasPainted(page);

  const scrubber = page.getByLabel("Pozycja w rundzie");
  await expect(scrubber).toBeEnabled();
  await expect(scrubber).toHaveValue("0");

  await page.getByRole("button", { name: "Odtwórz" }).click();
  await expect.poll(async () => Number(await scrubber.inputValue())).toBeGreaterThan(5);
  await page.getByRole("button", { name: "Pauza" }).click();

  // Seeking moves the playhead.
  const before = Number(await scrubber.inputValue());
  await page.getByRole("button", { name: /^Do przodu/ }).click();
  await expect.poll(async () => Number(await scrubber.inputValue())).toBeGreaterThan(before);

  // Round 5 comes from the DB like round 1.
  const ticks = page.waitForResponse(
    (r) => r.url().includes(`/api/matches/${matchId}/ticks`) && r.url().includes("round=5") && r.ok()
  );
  await page.getByRole("button", { name: /^Runda 5,/ }).click();
  const body = (await (await ticks).json()) as { source: string; ticks: unknown[] };
  expect(body.source).toBe("db");
  expect(body.ticks.length).toBeGreaterThan(100);
  await expect(page.getByRole("button", { name: /^Runda 5,/ })).toHaveAttribute("aria-current", "true");
  await expect(scrubber).toHaveValue("0");
  await expectCanvasPainted(page);

  await page.getByRole("button", { name: "Następna runda" }).click();
  await expect(page.getByRole("button", { name: /^Runda 6,/ })).toHaveAttribute("aria-current", "true");
});

for (const tool of ["heatmaps", "grenades"] as const) {
  test(`kanwa: ${tool}`, async ({ page, seed }) => {
    await page.goto(`/${tool}/${seed.matchIds[0]}`);
    await expectCanvasPainted(page);
  });
}

test("ekonomia meczu ma wykres rund", async ({ page, seed }) => {
  await page.goto(`/economy/${seed.matchIds[0]}`);
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
});
