/**
 * The main path: upload a demo, the worker analyses it, the report and the
 * replay are there, the .dem is deleted, and the analysis can be removed.
 * The demo is a fixture (src/lib/parsers/fixture-demo.ts); everything after
 * the parser is the real pipeline.
 */
import { fixtureDemoText } from "../../src/lib/parsers/fixture-demo";
import { expect, expectCanvasPainted, test } from "../fixtures";
import type { Page } from "@playwright/test";

const ANALYSIS_TIMEOUT = 120_000;

async function uploadDemo(page: Page, name: string, contents: string, opts: { keepDemo?: boolean } = {}) {
  await page.goto("/upload");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(contents),
  });
  await expect(page.getByText(name)).toBeVisible();
  if (opts.keepDemo) await page.getByLabel(/Zachowaj pliki demo/).check();
  await page.getByRole("button", { name: "Wgraj i analizuj" }).click();
}

/** The library card (actions row) of one match. */
const libraryCard = (page: Page, matchId: string) =>
  page.locator("div").filter({ has: page.locator(`a[href="/report/${matchId}"]`) }).last();

test("upload → analiza → raport → replay → usunięcie analizy", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const name = `e2e-upload-${testInfo.project.name}.dem`;
  await uploadDemo(page, name, fixtureDemoText(11 + testInfo.workerIndex, undefined));

  // One plain upload opens its match when the analysis is done.
  await page.waitForURL(/\/matches\/[a-z0-9]+$/, { timeout: ANALYSIS_TIMEOUT });
  const matchId = page.url().split("/").pop()!;
  await expect(page.getByText("Mirage").first()).toBeVisible();
  await expect(page.getByText("e2e_player").first()).toBeVisible();

  // Queue: finished, with a link to it.
  await page.goto("/queue");
  await expect(page.locator(`a[href="/matches/${matchId}"]`)).toBeVisible();

  // Report and replay come from the DB …
  await page.goto(`/report/${matchId}`);
  await expect(page.getByText("Rada:").first()).toBeVisible();
  await page.goto(`/replay/${matchId}`);
  await expectCanvasPainted(page);

  // … and the .dem is gone (deleted after analysis, S7).
  await page.goto("/library");
  const card = libraryCard(page, matchId);
  await expect(card.locator("xpath=..").getByText("Demo usunięte")).toBeVisible();

  // Removing the analysis takes the match with it.
  page.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Usuń analizę" }).click();
  await expect(page.locator(`a[href="/report/${matchId}"]`)).toHaveCount(0);
  const res = await page.goto(`/matches/${matchId}`);
  expect(res?.status()).toBe(404);
});

test("„zachowaj demo”, potem ręczne usunięcie pliku", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const name = `e2e-keep-${testInfo.project.name}.dem`;
  await uploadDemo(page, name, fixtureDemoText(21 + testInfo.workerIndex), { keepDemo: true });
  await page.waitForURL(/\/matches\/[a-z0-9]+$/, { timeout: ANALYSIS_TIMEOUT });
  const matchId = page.url().split("/").pop()!;

  await page.goto("/library");
  const card = libraryCard(page, matchId);
  await expect(card.locator("xpath=..").getByText("Demo zachowane")).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Usuń demo" }).click();
  await expect(card.locator("xpath=..").getByText("Demo usunięte")).toBeVisible();
  // The analysis stays.
  await expect(page.locator(`a[href="/report/${matchId}"]`)).toBeVisible();

  // Clean up so the other specs see only the seed.
  page.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Usuń analizę" }).click();
  await expect(page.locator(`a[href="/report/${matchId}"]`)).toHaveCount(0);
});

test("uszkodzone demo kończy się błędem w kolejce", async ({ page }, testInfo) => {
  const name = `e2e-zepsute-${testInfo.project.name}.dem`;
  await uploadDemo(page, name, "to nie jest demo CS2");
  await expect(page.getByText("Demo file is corrupt or not a CS2 demo")).toBeVisible({ timeout: ANALYSIS_TIMEOUT });

  await page.goto("/queue");
  const item = page.locator("div").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "Ponów" }) }).last();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Usuń" }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
