Plan and implement a new feature for CS2 Analyst end-to-end.

## Instructions

1. **Research phase**: Read relevant skills in `.claude/skills/` and existing similar features
2. **Plan**: Use plan mode to design the implementation before writing code
3. **Implementation order**:
   a. Database schema changes (if needed) → `prisma/schema.prisma` → `npm run db:push`
   b. Parser updates (if needed) → `src/lib/parsers/demo-parser.ts`
   c. Worker updates → `workers/demo-parser.worker.ts`
   d. API route → `src/app/api/...`
   e. Page component → `src/app/(dashboard)/...`
   f. Client components → same directory as page
4. **Conventions**:
   - Follow `CLAUDE.md` code conventions strictly
   - Follow `DESIGN.md` styling (or `.claude/skills/design-system/SKILL.md`)
   - All stats use Geist Mono (`font-mono`)
   - Server Components by default
   - Use existing UI components from `src/components/ui/`
5. **Verify**: Run `npx tsc --noEmit` after implementation
6. **Test with real data**: Use debug scripts in `scripts/` if needed

## Args
$ARGUMENTS — Feature name and requirements
