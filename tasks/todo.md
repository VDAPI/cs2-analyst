# Phase 1 MVP — Make `npm run dev` work cleanly

## Status: DONE

---

### Tasks

- [x] **1. Fix `next.config.ts`** — Moved `serverComponentsExternalPackages` to top-level `serverExternalPackages`. Also removed redundant `webpack` config that caused Turbopack warning.

- [x] **2. Install `geist` font package** — `npm install geist` added. Imports in `layout.tsx` resolve correctly.

- [x] **3. Verify Tailwind v4 + PostCSS** — Works out of the box with Turbopack. No config files needed.

- [x] **4. Verify landing page renders** — Page loads at `localhost:3000` with Geist fonts, design tokens, and feature grid rendering correctly. No errors or warnings.

- [x] **5. Create CLAUDE.md** — Created ~75-line project context file based on AGENTS.md.
