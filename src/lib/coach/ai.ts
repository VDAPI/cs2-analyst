/**
 * Claude API calls of the AI coach (S15). Server-only. The model gets the
 * facts JSON (facts.ts) and returns structured output; every text is then
 * checked against the facts (grounding.ts) and anything ungrounded falls back
 * to the standard text. Off unless ANTHROPIC_API_KEY is set; the model can be
 * changed with COACH_MODEL.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { factNumbers, isGrounded } from "./grounding";
import type { MatchFacts, PlanFacts } from "./facts";
import type { CoachMatchText, CoachPlanText } from "./text";

export const DEFAULT_COACH_MODEL = "claude-opus-5-5";
/** Bump when prompts or schemas change; cached AI texts are rewritten. */
export const COACH_PROMPT_VERSION = 1;
const MAX_TOKENS = 16000;
const TIMEOUT_MS = 120_000;

export function coachAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function coachModel(): string {
  return process.env.COACH_MODEL?.trim() || DEFAULT_COACH_MODEL;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 2 });
  return client;
}

const RULES = `You are the coach inside CS2 Analyst, an app that analyses Counter-Strike 2 demos. You write to one player about their own play.

Hard rules:
1. Use only the facts in the JSON you are given. Never invent rounds, numbers, weapons, positions, callouts, opponents, teammates or events. Every number you write must appear in the facts. If the facts don't say something, don't say it.
2. Judge decisions only by what the player could know at that moment: sound, what they or their team had seen, team information. Never blame them for something only the all-seeing top-down demo view shows.
3. Each issue gets exactly one concrete action the player can apply in their next match. Base it on the issue's standard advice and drill; you may make it more specific with the issue's own examples and numbers.
4. Mention drills only by the names given in the facts. Don't recommend other maps, tools, configs or videos.
5. Tone: a direct, friendly coach talking to the player in the second person (informal "ty" in Polish). No hype, no emojis, no markdown, no lists inside strings.
6. Write in the language named in the facts' "language" field. Facts may be in Polish; translate them faithfully if the language is English.
7. Keep every issue "type" exactly as given, one entry per issue, in the given order.`;

const MATCH_TASK = `Write the coach's notes for this match.
- summary: at most 2 sentences, what matters most in this match and where to start.
- for each issue: headline (at most 8 words, the issue in plain words), explanation (at most 3 sentences: what happened, referring to specific example rounds and their numbers, and why it cost rounds), action (1–2 sentences: the one thing to do next match).`;

const PLAN_TASK = `Write the coach's text for this week's training plan. The targets, drills and schedule are fixed by the app; don't change or add any.
- intro: at most 3 sentences, what the week is about and why these focuses, mentioning the numbers that matter.
- for each focus: why (at most 2 sentences, why this focus now, with its current number and this week's target), action (1–2 sentences: how to apply it in matches this week; you may refer to its drills by name).`;

function matchSchema(types: string[]) {
  return z.object({
    summary: z.string(),
    items: z.array(
      z.object({
        type: z.enum(types as [string, ...string[]]),
        headline: z.string(),
        explanation: z.string(),
        action: z.string(),
      })
    ),
  });
}

function planSchema(types: string[]) {
  return z.object({
    intro: z.string(),
    focus: z.array(z.object({ type: z.enum(types as [string, ...string[]]), why: z.string(), action: z.string() })),
  });
}

async function ask<T>(task: string, facts: unknown, format: ReturnType<typeof betaZodOutputFormat<z.ZodType<T>>>): Promise<{ data: T; model: string } | null> {
  const response = await getClient().beta.messages.parse({
    model: coachModel(),
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    // A safety classifier declining a request re-runs it on a fallback model.
    fallbacks: "default",
    system: RULES,
    messages: [{ role: "user", content: `${task}\n\nFacts (JSON):\n${JSON.stringify(facts)}` }],
    output_config: { effort: "medium", format },
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const data = response.parsed_output as T | null;
  return data ? { data, model: response.model } : null;
}

export interface AiResult<T> {
  text: T;
  model: string;
  /** Items dropped because they cited a number the facts don't have. */
  rejected: number;
}

const short = (s: string, max: number) => s.trim().slice(0, max);

type RawMatch = { summary: string; items: Array<{ type: string; headline: string; explanation: string; action: string }> };
type RawPlan = { intro: string; focus: Array<{ type: string; why: string; action: string }> };

/** The model's match notes, keeping only items whose numbers the facts back (pure). */
export function groundMatchText(raw: RawMatch, facts: MatchFacts): { text: Partial<CoachMatchText>; rejected: number } {
  const allowed = factNumbers(facts);
  const types = new Set(facts.issues.map((i) => i.type));
  const seen = new Set<string>();
  const items: CoachMatchText["items"] = [];
  let rejected = 0;
  for (const item of raw.items) {
    if (!types.has(item.type) || seen.has(item.type)) continue;
    seen.add(item.type);
    const clean = {
      type: item.type,
      headline: short(item.headline, 120),
      explanation: short(item.explanation, 900),
      action: short(item.action, 500),
    };
    if (clean.headline && clean.explanation && clean.action && isGrounded([clean.headline, clean.explanation, clean.action], allowed)) {
      items.push(clean);
    } else rejected++;
  }
  const summary = short(raw.summary, 500);
  const summaryOk = summary.length > 0 && isGrounded([summary], allowed);
  if (!summaryOk) rejected++;
  return { text: { summary: summaryOk ? summary : undefined, items }, rejected };
}

/** The model's plan text, keeping only parts whose numbers the facts back (pure). */
export function groundPlanText(raw: RawPlan, facts: PlanFacts): { text: Partial<CoachPlanText>; rejected: number } {
  const allowed = factNumbers(facts);
  const types = new Set(facts.focuses.map((f) => f.type));
  const seen = new Set<string>();
  const focus: CoachPlanText["focus"] = [];
  let rejected = 0;
  for (const f of raw.focus) {
    if (!types.has(f.type) || seen.has(f.type)) continue;
    seen.add(f.type);
    const clean = { type: f.type, why: short(f.why, 600), action: short(f.action, 500) };
    if (clean.why && clean.action && isGrounded([clean.why, clean.action], allowed)) focus.push(clean);
    else rejected++;
  }
  const intro = short(raw.intro, 700);
  const introOk = intro.length > 0 && isGrounded([intro], allowed);
  if (!introOk) rejected++;
  return { text: { intro: introOk ? intro : undefined, focus }, rejected };
}

export async function writeMatchText(facts: MatchFacts): Promise<AiResult<Partial<CoachMatchText>> | null> {
  const types = facts.issues.map((i) => i.type);
  if (types.length === 0) return null;
  const res = await ask(MATCH_TASK, facts, betaZodOutputFormat(matchSchema(types)));
  return res ? { ...groundMatchText(res.data, facts), model: res.model } : null;
}

export async function writePlanText(facts: PlanFacts): Promise<AiResult<Partial<CoachPlanText>> | null> {
  const types = facts.focuses.map((f) => f.type);
  if (types.length === 0) return null;
  const res = await ask(PLAN_TASK, facts, betaZodOutputFormat(planSchema(types)));
  return res ? { ...groundPlanText(res.data, facts), model: res.model } : null;
}
