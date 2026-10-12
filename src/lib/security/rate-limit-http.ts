/** Route-handler side of the rate limiter (src/lib/security/rate-limit.ts). */
import { NextResponse } from "next/server";
import { hitRateLimit, type RateResult, type RateRuleName } from "./rate-limit";

/** The 429 answer for a request over its limit. */
export function tooManyRequests(result: RateResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Try again in a moment.", retryAfter: result.retryAfter },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } }
  );
}

/** For route handlers: null when allowed, otherwise the 429 response to return. */
export async function rateLimit(name: RateRuleName, key: string): Promise<NextResponse | null> {
  const result = await hitRateLimit(name, key);
  return result.allowed ? null : tooManyRequests(result);
}
