import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Lightbulb, Swords, Trophy } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard, buttonVariants } from "@/components/ui";
import { PlayFilters } from "@/components/roles/play-filters";
import { RoleBadge } from "@/components/roles/role-card";
import { SpotsMap } from "@/components/roles/spots-map";
import { metricLabel } from "@/components/roles/labels";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { cn } from "@/lib/utils/cn";
import { getNormTable } from "@/lib/norms/persist";
import { medianByMetric, METRIC_DIRECTION, proNorm, roleNorm, rolePool, sampleKey, verdictVs } from "@/lib/norms/norms";
import { formatNormValue, METRIC_GROUPS, METRIC_UNIT } from "@/lib/norms/view";
import { listProPlayers, mapPlaceLookup, playerSamples, proSamples, roleProfiles } from "@/lib/roles/persist";
import type { Role, SideProfile } from "@/lib/roles/roles";
import {
  formatProfileValue,
  medianProfile,
  PROFILE_FIELDS,
  ROLE_METRICS,
  roleCounts,
  roleDescKey,
  roleKey,
  roleTipKeys,
  spotPlaces,
  type RoleMetric,
} from "@/lib/roles/view";

export const dynamic = "force-dynamic";

/** How many of the player's latest matches "Ty" is the median of. */
const YOUR_MATCHES = 10;
/** Dots per side on the positions map. */
const MAX_SPOTS = 120;

interface Props {
  searchParams: Promise<{ pro?: string; map?: string; side?: string }>;
}

const VERDICT_TONE: Record<string, string> = {
  better: "text-[var(--good)]",
  within: "text-[var(--text-primary)]",
  worse: "text-[var(--mistake)]",
};

export default async function PlayLikeProPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const steamId = session.user.steamId ?? null;
  const { t } = await getT();
  const sp = await searchParams;

  const [pros, user] = await Promise.all([
    listProPlayers(prisma),
    prisma.user.findUnique({ where: { id: userId }, select: { favoriteProSteamId: true } }),
  ]);

  const header = (
    <PageHeader eyebrow={t("roles.eyebrow")} title={t("roles.title")} description={t("roles.description")} />
  );

  if (pros.length === 0) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <EmptyState
          icon={Trophy}
          title={t("roles.noPros")}
          description={t("roles.noProsHint")}
          action={
            <Link href="/pro" className={buttonVariants({ variant: "secondary" })}>
              {t("nav.pro")}
            </Link>
          }
        />
        <RoleGuide t={t} />
      </div>
    );
  }

  const favorite = user?.favoriteProSteamId ?? null;
  const pro = pros.find((p) => p.steamId === sp.pro) ?? pros.find((p) => p.steamId === favorite) ?? pros[0];
  const side: "CT" | "T" = sp.side === "CT" ? "CT" : "T";
  const map = sp.map === "all" || (sp.map && pro.maps.includes(sp.map)) ? sp.map : (pro.maps[0] ?? "all");

  const [proRows, mine] = await Promise.all([
    proSamples(prisma, { steamId: pro.steamId, side, map }),
    steamId ? playerSamples(prisma, { userId, steamId, side, map, take: YOUR_MATCHES }) : Promise.resolve([]),
  ]);
  const proRole: Role | null = roleCounts(proRows.map((r) => r.role))[0]?.role ?? pro.roles[0] ?? null;
  const myRoles = roleCounts(mine.map((r) => r.role));

  const [table, roleProfs, placeOf] = await Promise.all([
    getNormTable(prisma, { pools: ["pro", ...(proRole ? [rolePool(proRole)] : [])], map }),
    proRole ? roleProfiles(prisma, { role: proRole, side, map }) : Promise.resolve([] as SideProfile[]),
    mapPlaceLookup(prisma, map),
  ]);

  const you = medianByMetric(mine.map((r) => r.metrics));
  const them = medianByMetric(proRows.map((r) => r.metrics));
  const profiles = (rows: typeof mine) => rows.map((r) => r.profile).filter((p): p is SideProfile => p != null);
  const myProfile = medianProfile(profiles(mine));
  const proProfile = medianProfile(profiles(proRows));
  const roleProfile = medianProfile(roleProfs);

  const spotsOf = (rows: typeof mine) => profiles(rows).flatMap((p) => p.spots).slice(0, MAX_SPOTS);
  const mySpots = spotsOf(mine);
  const proSpots = spotsOf(proRows);
  const mapConfig = map !== "all" ? getMapConfig(map) : null;

  const keyMetrics: RoleMetric[] = proRole ? ROLE_METRICS[proRole] : [];
  const keySet = new Set(keyMetrics.map((m) => sampleKey(m.metric, m.situation)));
  const otherMetrics: RoleMetric[] = METRIC_GROUPS.flatMap((g) => g.metrics)
    .map((metric) => ({ metric, situation: "all" as const }))
    .filter((m) => !keySet.has(sampleKey(m.metric, m.situation)));

  const ctx = { map, side };
  const roleName = proRole ? t(roleKey(proRole)) : "–";

  return (
    <div className="min-w-0 space-y-6">
      {header}

      <Suspense>
        <PlayFilters
          pro={pro.steamId}
          map={map}
          side={side}
          favorite={favorite === pro.steamId}
          pros={pros.map((p) => ({
            value: p.steamId,
            label: `${p.name} · ${t("roles.proMatches", { n: p.matches })}${p.roles[0] ? ` · ${t(roleKey(p.roles[0]))}` : ""}`,
          }))}
          maps={[{ value: "all", label: t("roles.allMaps") }, ...pro.maps.map((m) => ({ value: m, label: mapDisplayName(m) }))]}
        />
      </Suspense>
      <p className="-mt-3 text-xs text-[var(--text-tertiary)]">{t("roles.pickProHint")}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("roles.proRole")} value={roleName} highlight={proRole != null} hint={pro.name} />
        <StatCard
          label={t("roles.yourRole")}
          value={myRoles[0] ? t(roleKey(myRoles[0].role)) : "–"}
          hint={mine.length > 0 ? t("norms.youHint", { n: mine.length }) : undefined}
        />
        <StatCard label={t("roles.map")} value={map === "all" ? t("roles.allMaps") : mapDisplayName(map)} />
        <StatCard label={t("roles.side")} value={side} />
      </div>

      {proRole && (
        <Card className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
          <Swords className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--accent-2)" }} aria-hidden />
          <div className="min-w-0 space-y-2">
            <p>
              <span className="font-semibold text-[var(--text-primary)]">{pro.name}</span> · {t(roleDescKey(proRole))}
            </p>
            {myRoles.length > 0 && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                {t("roles.rolesSeen")}:
                {myRoles.map((r) => (
                  <span key={r.role} className="inline-flex items-center gap-1">
                    <RoleBadge role={r.role} t={t} />
                    <span className="font-mono">×{r.n}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        </Card>
      )}

      {proRows.length === 0 && <Card className="text-sm text-[var(--text-secondary)]">{t("roles.noProSide")}</Card>}
      {mine.length === 0 && <Card className="text-sm text-[var(--text-secondary)]">{t("roles.noYou")}</Card>}

      {/* Metrics */}
      <section className="space-y-2" aria-labelledby="like-pro-metrics">
        <SectionTitle>
          <span id="like-pro-metrics">{t("roles.metricsTitle")}</span>
        </SectionTitle>
        <p className="text-sm text-[var(--text-tertiary)]">{t("roles.metricsHint", { n: mine.length })}</p>
        <MetricsTable rows={keyMetrics} you={you} them={them} proName={pro.name} role={proRole} table={table} ctx={ctx} t={t} />
        <details className="group">
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium text-[var(--accent-hover)]">
            {t("roles.allMetrics")}
          </summary>
          <div className="mt-2">
            <MetricsTable rows={otherMetrics} you={you} them={them} proName={pro.name} role={proRole} table={table} ctx={ctx} t={t} />
          </div>
        </details>
      </section>

      {/* Timing and spacing */}
      <section className="space-y-2" aria-labelledby="like-pro-timing">
        <SectionTitle>
          <span id="like-pro-timing">{t("roles.timingTitle")}</span>
        </SectionTitle>
        <p className="text-sm text-[var(--text-tertiary)]">{t("roles.timingHint")}</p>
        <div className="table-scroll rounded-xl border border-[var(--border)]">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("roles.colMetric")}</th>
                <th className="text-right">{t("roles.colYou")}</th>
                <th className="max-w-[120px] truncate text-right">{pro.name}</th>
                <th className="text-right">{proRole ? t("roles.colRolePros", { role: roleName }) : t("norms.colPro")}</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_FIELDS.filter((f) => f.sides.includes(side)).map((f) => (
                <tr key={f.key}>
                  <td className="min-w-[120px] max-w-[150px] whitespace-normal sm:max-w-[260px]">
                    {t(`roles.profile.${f.key}` as MessageKey)}
                  </td>
                  <td className="text-right font-mono text-[var(--text-primary)]">{formatProfileValue(myProfile[f.key], f.unit)}</td>
                  <td className="text-right font-mono text-[var(--accent-2)]">{formatProfileValue(proProfile[f.key], f.unit)}</td>
                  <td className="text-right font-mono text-[var(--text-secondary)]">{formatProfileValue(roleProfile[f.key], f.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Positions */}
      {map !== "all" && (
        <section className="space-y-2" aria-labelledby="like-pro-spots">
          <SectionTitle>
            <span id="like-pro-spots">{t("roles.positionsTitle")}</span>
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">{t("roles.positionsHint")}</p>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(240px,1fr)] lg:items-start">
            <div className="min-w-0">
              <SpotsMap
                mapRaw={map}
                mapName={mapDisplayName(map)}
                mapConfig={
                  mapConfig
                    ? {
                        posX: mapConfig.posX,
                        posY: mapConfig.posY,
                        scale: mapConfig.scale,
                        width: mapConfig.width,
                        height: mapConfig.height,
                        radarImage: mapConfig.radarImage,
                      }
                    : null
                }
                mine={mySpots}
                pro={proSpots}
                proName={pro.name}
              />
            </div>
            {placeOf && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <SpotList title={t("roles.legendYou")} tone="var(--accent)" spots={spotPlaces(mySpots, placeOf)} t={t} />
                <SpotList title={pro.name} tone="var(--accent-2)" spots={spotPlaces(proSpots, placeOf)} t={t} />
              </div>
            )}
          </div>
        </section>
      )}

      {proRole && <RoleTips role={proRole} t={t} />}
    </div>
  );
}

function MetricsTable({
  rows,
  you,
  them,
  proName,
  role,
  table,
  ctx,
  t,
}: {
  rows: RoleMetric[];
  you: Record<string, { value: number; matches: number }>;
  them: Record<string, { value: number; matches: number }>;
  proName: string;
  role: Role | null;
  table: Awaited<ReturnType<typeof getNormTable>>;
  ctx: { map: string; side: "CT" | "T" };
  t: TFunction;
}) {
  return (
    <div className="table-scroll rounded-xl border border-[var(--border)]">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("roles.colMetric")}</th>
            <th className="text-right">{t("roles.colYou")}</th>
            <th className="max-w-[120px] truncate text-right">{proName}</th>
            <th className="text-right">{role ? t("roles.colRolePros", { role: t(roleKey(role)) }) : t("norms.colPro")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = sampleKey(r.metric, r.situation);
            const unit = METRIC_UNIT[r.metric] ?? "";
            const mine = you[key]?.value ?? null;
            const theirs = them[key]?.value ?? null;
            const ctxS = { ...ctx, situation: r.situation };
            const norm = (role ? roleNorm(table, role, r.metric, ctxS) : null) ?? proNorm(table, r.metric, ctxS);
            const direction = METRIC_DIRECTION[r.metric];
            // Judged against the chosen pro when they have a value, else against the role's norm.
            const verdict =
              mine == null || !direction
                ? null
                : theirs != null
                  ? mine === theirs
                    ? "within"
                    : (mine > theirs) === (direction === "higher")
                      ? "better"
                      : "worse"
                  : norm
                    ? verdictVs(mine, norm, direction)
                    : null;
            return (
              <tr key={key}>
                <td className="min-w-[120px] max-w-[150px] whitespace-normal sm:max-w-[260px]">{metricLabel(t, r.metric, r.situation)}</td>
                <td className={cn("text-right font-mono", verdict ? VERDICT_TONE[verdict] : "text-[var(--text-primary)]")}>
                  {formatNormValue(mine, unit)}
                </td>
                <td className="text-right font-mono font-semibold text-[var(--accent-2)]">{formatNormValue(theirs, unit)}</td>
                <td className="whitespace-nowrap text-right font-mono text-[var(--text-secondary)]">
                  {norm ? `${norm.source === "reference" ? "≈" : ""}${formatNormValue(norm.p50, unit)}` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SpotList({
  title,
  tone,
  spots,
  t,
}: {
  title: string;
  tone: string;
  spots: Array<{ place: string; share: number }>;
  t: TFunction;
}) {
  return (
    <Card className="space-y-2">
      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tone }} aria-hidden />
        <span className="truncate">{title}</span>
      </p>
      <p className="label-overline text-[var(--text-tertiary)]">{t("roles.topSpots")}</p>
      {spots.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">{t("roles.noSpots")}</p>
      ) : (
        <ul className="space-y-1">
          {spots.map((s) => (
            <li key={s.place} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-[var(--text-secondary)]">{s.place}</span>
              <span className="font-mono text-[var(--text-primary)]">{s.share}%</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RoleTips({ role, t }: { role: Role; t: TFunction }) {
  return (
    <section className="space-y-2" aria-labelledby="like-pro-tips">
      <SectionTitle>
        <span id="like-pro-tips">{t("roles.tipsTitle", { role: t(roleKey(role)) })}</span>
      </SectionTitle>
      <Card>
        <ul className="space-y-2">
          {roleTipKeys(role).map((k) => (
            <li key={k} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Without pro demos: what each role means and how to play it. */
function RoleGuide({ t }: { t: TFunction }) {
  const roles: Role[] = ["entry", "awp", "support", "lurk", "anchor"];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map((role) => (
        <Card key={role} className="space-y-2">
          <div className="flex items-center gap-2">
            <RoleBadge role={role} t={t} />
            {role === "anchor" && <Badge variant="ct">CT</Badge>}
            {(role === "entry" || role === "lurk") && <Badge variant="t">T</Badge>}
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{t(roleDescKey(role))}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{t(roleTipKeys(role)[0])}</p>
        </Card>
      ))}
    </div>
  );
}
