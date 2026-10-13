/** The coach report of a seeded match: top issues, a 2D clip of a mistake, the jump into the replay. */
import { expect, expectCanvasPainted, test } from "../fixtures";

test("raport pokazuje błędy z radą, ćwiczeniem i podglądem 2D", async ({ page, seed }) => {
  const matchId = seed.matchIds[0];
  await page.goto(`/report/${matchId}`);
  await expect(page.locator("h1").first()).toBeVisible();

  // Top issues: each has one piece of advice and a drill.
  await expect(page.getByText("Rada:").first()).toBeVisible();
  await expect(page.getByText("Ćwiczenie:").first()).toBeVisible();

  // The worst moment of a top issue loads its 2D clip from the DB as soon as it is on screen.
  const topClip = page.locator("canvas[aria-label^='Podgląd 2D']").first();
  await topClip.scrollIntoViewIfNeeded();
  await expectCanvasPainted(page, "canvas[aria-label^='Podgląd 2D']");

  // Every issue lists its moments; each one opens its own clip.
  const issue = page.locator("details[id^='issue-']").first();
  await issue.locator("summary").click();
  const ticks = page.waitForResponse((r) => r.url().includes(`/api/matches/${matchId}/ticks`) && r.ok());
  await issue.getByRole("button", { name: "Podgląd 2D" }).first().click();
  await ticks;
  await expect(issue.locator("canvas").first()).toBeVisible();
});

test("z raportu do najgorszego momentu w replayu", async ({ page, seed }) => {
  const matchId = seed.matchIds[0];
  await page.goto(`/report/${matchId}`);
  await page.getByRole("link", { name: "Najgorszy moment w replayu" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/replay/${matchId}\\?.*round=\\d+`));
  const round = new URL(page.url()).searchParams.get("round");
  await expect(page.getByRole("button", { name: new RegExp(`^Runda ${round},`) })).toHaveAttribute("aria-current", "true");
  await expectCanvasPainted(page);
});

test("przewodnik po raporcie otwiera się z przycisku", async ({ page, seed }) => {
  await page.goto(`/report/${seed.matchIds[0]}`);
  // The seeded account has finished the guide: it doesn't open by itself.
  await expect(page.getByRole("link", { name: "Najgorszy moment w replayu" }).first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Wybierz gracza" })).toHaveCount(0);
  await page.getByRole("button", { name: "Jak czytać raport" }).click();
  const tour = page.getByTestId("report-tour");
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("heading", { name: "Wybierz gracza" })).toBeVisible();
  await tour.getByRole("button", { name: "Dalej" }).click();
  await expect(tour.getByRole("heading", { name: "Podsumowanie meczu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
});
