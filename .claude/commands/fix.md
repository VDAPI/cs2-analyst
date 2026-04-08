Debug and fix an issue in CS2 Analyst.

## Instructions

1. **Understand the bug**: Read error messages, check the relevant code
2. **Identify root cause**: Don't guess — trace the data flow
3. **For parser bugs**: Create/use a debug script in `scripts/` to inspect raw demoparser2 output before modifying parser code
4. **For UI bugs**: Check component props, data flow from API to page to client component
5. **For API bugs**: Check Prisma queries, auth checks, response format
6. **Fix**: Make the minimal change to fix the issue — don't refactor surrounding code
7. **Verify**: Run `npx tsc --noEmit` and test with real data if possible

## Common Pitfalls
- `dmg_health` in demoparser2 is raw weapon damage, not capped at HP
- FACEIT demos have knife round before real match — filter with `matchStartTick`
- Team sides swap at halftime — `team_number` from `parsePlayerInfo` is end-of-match
- Next.js 15 params must be `Promise<{...}>` and awaited
- Prisma DLL can be locked by running dev server — restart if `prisma generate` fails

## Args
$ARGUMENTS — Bug description and any error messages
