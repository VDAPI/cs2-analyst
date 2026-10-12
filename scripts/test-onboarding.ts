/**
 * Regression test for S21 (demo without login, onboarding).
 * Run: npm run test:onboarding
 *
 * 1. getDemoMatchId(): the admin's pick while its analysis is live, else the
 *    newest analysed pro demo, else nothing; setDemoMatchId() refuses a match
 *    without a finished analysis and clears with null.
 * 2. The report guide: both contexts start with the player picker, the
 *    visitor's ends on sign-up and the player's on replay/share; steps whose
 *    part isn't on the page are skipped; every step has PL and EN copy.
 * 3. /demo is public and read-only: replay data routes let it through
 *    `getMatchAccess`, notes stay private, the page builds a read-only clip
 *    context and isn't behind the login middleware.
 *
 * No database, demo file or network needed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { DEMO_MATCH_KEY, getDemoMatchId, isMatchId, setDemoMatchId } from "@/lib/demo/demo-match";
import { presentSteps, tourSteps, type TourKey } from "@/lib/onboarding/tour";
import { translate } from "@/lib/i18n/translate";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

interface Upload {
  matchId: string | null;
  pro: boolean;
  status: string;
  deletedAt: Date | null;
  createdAt: Date;
}

/** The two tables getDemoMatchId reads, in memory. */
function fakeDb(uploads: Upload[], settings = new Map<string, string>()) {
  const live = (u: Upload) => u.deletedAt == null && u.status === "COMPLETED";
  const db = {
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key)! } : null,
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        settings.set(where.key, create.value);
        return null;
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
        return { count: 1 };
      },
    },
    demoUpload: {
      findFirst: async ({ where }: { where: { matchId?: string | { not: null }; pro?: boolean } }) => {
        const rows = uploads
          .filter(live)
          .filter((u) => (typeof where.matchId === "string" ? u.matchId === where.matchId : u.matchId != null))
          .filter((u) => (where.pro ? u.pro : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ? { id: "u", matchId: rows[0].matchId } : null;
      },
    },
  };
  return { db: db as unknown as PrismaClient, settings };
}

const ID = (n: number) => `cmatch${String(n).padStart(19, "0")}`;
const day = (d: number) => new Date(Date.UTC(2026, 9, d));

async function main() {
  // ─── 1. Which match /demo shows ─────────────────────────
  check("cuid is a match id", isMatchId("clx0abc123def456ghi789jkl"));
  check("junk is not a match id", !isMatchId("../etc") && !isMatchId("") && !isMatchId(42) && !isMatchId("A".repeat(25)));

  const uploads: Upload[] = [
    { matchId: ID(1), pro: true, status: "COMPLETED", deletedAt: null, createdAt: day(1) },
    { matchId: ID(2), pro: true, status: "COMPLETED", deletedAt: null, createdAt: day(3) },
    { matchId: ID(3), pro: true, status: "FAILED", deletedAt: null, createdAt: day(5) },
    { matchId: ID(4), pro: true, status: "COMPLETED", deletedAt: day(6), createdAt: day(4) },
    { matchId: ID(5), pro: false, status: "COMPLETED", deletedAt: null, createdAt: day(7) },
  ];
  {
    const { db } = fakeDb(uploads);
    check("no pick: newest live pro demo", (await getDemoMatchId(db)) === ID(2));
  }
  {
    const { db, settings } = fakeDb(uploads);
    check("owner's own match can be picked", await setDemoMatchId(db, ID(5)));
    check("pick is stored", settings.get(DEMO_MATCH_KEY) === ID(5));
    check("pick wins over the pro pool", (await getDemoMatchId(db)) === ID(5));
    check("failed analysis can't be picked", !(await setDemoMatchId(db, ID(3))));
    check("deleted analysis can't be picked", !(await setDemoMatchId(db, ID(4))));
    check("unknown match can't be picked", !(await setDemoMatchId(db, ID(9))));
    check("refused pick keeps the old one", (await getDemoMatchId(db)) === ID(5));
    uploads[4].deletedAt = day(8);
    check("deleted pick falls back to the pro pool", (await getDemoMatchId(db)) === ID(2));
    uploads[4].deletedAt = null;
    await setDemoMatchId(db, null);
    check("null clears the pick", !settings.has(DEMO_MATCH_KEY) && (await getDemoMatchId(db)) === ID(2));
  }
  {
    const { db } = fakeDb([{ matchId: ID(5), pro: false, status: "COMPLETED", deletedAt: null, createdAt: day(1) }]);
    check("no pro demo and no pick: nothing to show", (await getDemoMatchId(db)) === null);
  }
  {
    const { db } = fakeDb(uploads, new Map([[DEMO_MATCH_KEY, "not a cuid"]]));
    check("garbage setting is ignored", (await getDemoMatchId(db)) === ID(2));
  }

  // ─── 2. Report guide ───────────────────────────────────
  const app = tourSteps("app");
  const demo = tourSteps("demo");
  check("both guides start at the player picker", app[0] === "player" && demo[0] === "player");
  check("player's guide ends on replay and sharing", app.at(-1) === "actions" && !app.includes("signup"));
  check("visitor's guide ends on sign-up", demo.at(-1) === "signup" && !demo.includes("actions"));
  check("no step twice", new Set(app).size === app.length && new Set(demo).size === demo.length);
  const onPage = new Set<TourKey>(["player", "summary", "top", "all", "actions"]);
  const shown = presentSteps(app, (k) => onPage.has(k));
  check("steps not on the page are skipped, order kept", shown.join() === "player,summary,top,all,actions");
  for (const key of new Set([...app, ...demo])) {
    for (const part of ["title", "body"] as const) {
      const k = `onboarding.tour.${key}.${part}` as const;
      const plText = translate("pl", k);
      const enText = translate("en", k);
      check(`guide step ${key}.${part} has PL and EN copy`, plText !== k && enText !== k && plText !== enText);
    }
  }
  const report = readFileSync(join(process.cwd(), "src/app/(dashboard)/report/[matchId]/report-body.tsx"), "utf8");
  const page = readFileSync(join(process.cwd(), "src/app/(dashboard)/report/[matchId]/page.tsx"), "utf8");
  const demoPage = readFileSync(join(process.cwd(), "src/app/demo/page.tsx"), "utf8");
  const shell = readFileSync(join(process.cwd(), "src/components/share/public-shell.tsx"), "utf8");
  const anchors = report + page + demoPage + shell;
  const missing = [...new Set([...app, ...demo])].filter(
    (k) => !anchors.includes(`data-tour="${k}"`) && !anchors.includes(`"${k}" : undefined`)
  );
  check(`every guide step has its anchor on the report${missing.length ? `: ${missing.join(", ")}` : ""}`, missing.length === 0);

  // ─── 3. Public and read-only ───────────────────────────
  const access = readFileSync(join(process.cwd(), "src/lib/sharing/access.ts"), "utf8");
  check("replay data routes let the example through", /isDemoMatch\(prisma, matchId\)/.test(access));
  const notes = readFileSync(join(process.cwd(), "src/app/api/matches/[matchId]/notes/route.ts"), "utf8");
  check("owner's notes stay private on the example", /access\.demo\) return NextResponse\.json\(\{ notes: \[\] \}\)/.test(notes));
  check("example report is read-only", /reportClipContext\(match\.id, match\.map, null, true\)/.test(demoPage));
  check("example has no AI coach (costs per call)", !demoPage.includes("MatchCoach"));
  const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
  check("/demo is not behind the login", !middleware.includes('"/demo'));
  const home = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  check("home page links to the example", home.includes('href="/demo"') && home.includes("Zobacz przykład"));
}

main().then(() => {
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
});
