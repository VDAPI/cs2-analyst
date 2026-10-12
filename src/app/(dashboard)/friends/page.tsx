import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { CheckCircle2, Medal, Target, Users } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, PageHeader, UserAvatar } from "@/components/ui";
import { FriendAction, FriendInviteCard } from "@/components/friends/friend-actions";
import { friendPath, friendSuggestions, listFriends, loadRankingInputs } from "@/lib/friends/load";
import { MIN_RANKING_MATCHES, RANKING_METRICS, RANKING_WINDOW, isRankingMetric, rankPlayers } from "@/lib/friends/ranking";
import { challengeWeek, challengesForWeek, evaluateChallenge } from "@/lib/friends/challenges";
import { buildHistory, formatProgressValue, progressMetric } from "@/lib/progress/metrics";
import { formatDate } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { MessageKey } from "@/lib/i18n/translate";

interface Props {
  searchParams: Promise<{ metric?: string }>;
}

/** Matches read per player: the ranking window plus a week of challenges. */
const READ_MATCHES = 20;

const SOURCE_KEY: Record<string, MessageKey> = {
  invite: "friends.sourceInvite",
  faceit: "friends.sourceFaceit",
  match: "friends.sourceMatch",
};

function Heading({ id, title, description }: { id?: string; title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="font-display text-lg font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {description && <p className="text-sm text-[var(--text-tertiary)]">{description}</p>}
    </div>
  );
}

/**
 * Friends (S25): ranking of the player and their friends by one metric over
 * their latest matches, this week's challenges, invite link, requests and
 * suggestions (FACEIT friends, players of the player's matches).
 */
export default async function FriendsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const query = await searchParams;
  const { t } = await getT();
  const metric = isRankingMetric(query.metric) ? query.metric : RANKING_METRICS[0];
  const def = progressMetric(metric)!;

  const [me, lists, suggestions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, faceitNickname: true, friendCode: true } }),
    listFriends(prisma, userId),
    friendSuggestions(prisma, userId),
  ]);
  const myName = me?.name?.trim() || me?.faceitNickname || t("friends.you");
  const inputs = await loadRankingInputs(prisma, { id: userId, name: myName }, lists.friends, READ_MATCHES);
  const ranking = rankPlayers(inputs, metric);
  const ranked = ranking.filter((r) => r.rank != null);
  const mine = ranking.find((r) => r.isMe);

  const week = challengeWeek(new Date());
  const challenges = challengesForWeek(week).map((c) => {
    const people = inputs.map((p) => ({ p, progress: evaluateChallenge(c, buildHistory(p.matches), week) }));
    return {
      def: c,
      mine: people.find((x) => x.p.isMe)!.progress,
      finishers: people.filter((x) => !x.p.isMe && x.progress.completed).map((x) => x.p.name),
    };
  });

  const metricLabel = (k: string) => t(`progressMetrics.${k}` as MessageKey);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t("friends.eyebrow")} title={t("friends.title")} description={t("friends.description")} />

      {/* Ranking */}
      <section aria-labelledby="ranking" className="space-y-3">
        <Heading id="ranking" title={t("friends.ranking")} description={t("friends.rankingHint", { n: RANKING_WINDOW, min: MIN_RANKING_MATCHES })} />
        <nav aria-label={t("friends.metricPicker")} className="flex flex-wrap gap-2">
          {RANKING_METRICS.map((k) => (
            <Link
              key={k}
              href={k === RANKING_METRICS[0] ? "/friends" : `/friends?metric=${k}`}
              aria-current={k === metric ? "true" : undefined}
              className={cn(
                "flex min-h-9 items-center rounded-lg border px-3 text-xs font-semibold transition-colors",
                k === metric
                  ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
              )}
            >
              {metricLabel(k)}
            </Link>
          ))}
        </nav>
        <Card className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-[var(--text-secondary)]">
              {mine?.rank != null ? (
                <>
                  {t("friends.yourPlace")}{" "}
                  <span className="font-mono text-lg font-semibold text-[var(--accent-2)]">{mine.rank}</span>{" "}
                  <span className="font-mono text-[var(--text-tertiary)]">/ {ranked.length}</span>
                </>
              ) : (
                t("friends.noPlace", { min: MIN_RANKING_MATCHES })
              )}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {metricLabel(metric)} · {t(def.direction === "higher" ? "friends.higherBetter" : "friends.lowerBetter")}
            </p>
          </div>
          <ol className="divide-y divide-[var(--border)]">
            {ranking.map((r) => (
              <li
                key={r.userId}
                className={cn("flex items-center gap-3 py-2", r.isMe && "-mx-2 rounded-lg bg-[var(--accent-muted)] px-2")}
                aria-current={r.isMe ? "true" : undefined}
              >
                <span
                  className={cn(
                    "w-7 shrink-0 text-center font-mono text-sm font-semibold",
                    r.rank === 1 ? "text-[var(--accent-2)]" : "text-[var(--text-tertiary)]"
                  )}
                >
                  {r.rank ?? "–"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                  {r.name}
                  {r.isMe && <span className="ml-1 text-[var(--text-tertiary)]">({t("friends.you")})</span>}
                </span>
                <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{t("friends.matches", { n: r.matches })}</span>
                <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-[var(--text-primary)]">
                  {formatProgressValue(def, r.value)}
                </span>
              </li>
            ))}
          </ol>
          {lists.friends.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">{t("friends.rankingAlone")}</p>}
        </Card>
      </section>

      {/* Weekly challenges */}
      <section aria-labelledby="challenges" className="space-y-3">
        <Heading id="challenges" title={t("friends.challenges")} description={t("friends.challengesHint", { date: formatDate(week) })} />
        <div className="grid gap-3 md:grid-cols-3">
          {challenges.map(({ def: c, mine: p, finishers }) => {
            const m = progressMetric(c.metric)!;
            return (
              <Card key={c.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      p.completed ? "bg-[var(--accent-2-muted)] text-[var(--accent-2)]" : "bg-[var(--accent-muted)] text-[var(--accent)]"
                    )}
                  >
                    {p.completed ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Target className="h-5 w-5" aria-hidden />}
                  </span>
                  <p className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">
                    {t(m.direction === "higher" ? "friends.challengeHigher" : "friends.challengeLower", {
                      metric: metricLabel(c.metric),
                      target: formatProgressValue(m, c.target),
                      n: c.matches,
                    })}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{p.completed ? t("friends.challengeDone") : t("friends.challengeProgress")}</span>
                    <span className="font-mono tabular-nums text-[var(--text-tertiary)]">
                      {p.done}/{p.needed}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-4)]" role="progressbar" aria-valuemin={0} aria-valuemax={p.needed} aria-valuenow={p.done}>
                    <span
                      className={cn("block h-full rounded-full", p.completed ? "bg-[var(--accent-2)]" : "bg-[var(--accent)]")}
                      style={{ width: `${(p.done / p.needed) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                    {t("friends.challengeBest")} <span className="font-mono text-[var(--text-secondary)]">{formatProgressValue(m, p.best)}</span>
                  </p>
                </div>
                <p className="mt-auto flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                  <Medal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {finishers.length > 0 ? t("friends.challengeFinishers", { names: finishers.join(", ") }) : t("friends.challengeNoFinishers")}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* People */}
      <section aria-labelledby="people" className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <Heading id="people" title={t("friends.invite")} description={t("friends.inviteDescription")} />
          <FriendInviteCard initialPath={me?.friendCode ? friendPath(me.friendCode) : null} />
          {lists.incoming.length > 0 && (
            <div className="space-y-2">
              <h3 className="label-overline text-[var(--text-tertiary)]">{t("friends.incoming")}</h3>
              <ul className="space-y-2">
                {lists.incoming.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2">
                    <UserAvatar name={f.name} image={f.image} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">{f.name}</span>
                    <FriendAction kind="accept" id={f.id} name={f.name} />
                    <FriendAction kind="decline" id={f.id} name={f.name} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="label-overline text-[var(--text-tertiary)]">{t("friends.suggestions")}</h3>
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.userId} className="flex flex-wrap items-center gap-2">
                    <UserAvatar name={s.name} image={s.image} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--text-primary)]">{s.name}</span>
                      <span className="block text-xs text-[var(--text-tertiary)]">{t(SOURCE_KEY[s.source])}</span>
                    </span>
                    <FriendAction kind="request" userId={s.userId} name={s.name} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lists.outgoing.length > 0 && (
            <div className="space-y-2">
              <h3 className="label-overline text-[var(--text-tertiary)]">{t("friends.outgoing")}</h3>
              <ul className="space-y-2">
                {lists.outgoing.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2">
                    <UserAvatar name={f.name} image={f.image} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">{f.name}</span>
                    <FriendAction kind="cancel" id={f.id} name={f.name} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <Heading title={t("friends.list", { n: lists.friends.length })} />
          {lists.friends.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-[var(--border)] p-4">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{t("friends.emptyTitle")}</p>
                <p className="text-sm text-[var(--text-tertiary)]">{t("friends.emptyBody")}</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {lists.friends.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2">
                  <UserAvatar name={f.name} image={f.image} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--text-primary)]">{f.name}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      <Badge variant="neutral" className="mr-1">
                        {t(SOURCE_KEY[f.source] ?? "friends.sourceInvite")}
                      </Badge>
                      {t("friends.since", { date: formatDate(f.since) })}
                    </span>
                  </span>
                  <FriendAction kind="remove" id={f.id} name={f.name} />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[var(--text-tertiary)]">{t("friends.privacy")}</p>
        </Card>
      </section>
    </div>
  );
}
