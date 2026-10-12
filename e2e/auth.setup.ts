import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE_FILE, E2E_USER } from "./env";

/** Log the seeded account in through the real form once; every spec reuses the session. */
setup("log in as the E2E account", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_USER.email);
  await page.getByLabel("Hasło").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(page.locator("h1").first()).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE_FILE });
});
