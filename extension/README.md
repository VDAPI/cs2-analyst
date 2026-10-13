# CS2 Analyst — browser extension (S26)

Adds an **“Analizuj w CS2 Analyst” / “Analyze in CS2 Analyst”** button to FACEIT
match rooms (`https://www.faceit.com/<lang>/cs2/room/<match id>`). The button
opens `<app>/faceit/room/<match id>`, which shows the report when the match is
analysed, or the match list with that match selected in the FACEIT picker.
Nothing is downloaded until the player clicks “Analizuj zaznaczone” in the app.

- Manifest V3, works in Chrome / Edge / Brave and Firefox (115+).
- Permissions: `storage` only (the app address, default `http://localhost:3000`,
  set by clicking the extension icon).
- `lib/room.js` holds the pure helpers (room link → match id, app link); the
  repo test `npm run test:integrations` checks them, the manifest and the PL/EN
  messages in `_locales/`.

Loading it locally (not published in any store): `docs/TESTOWANIE.md`, section 12.
