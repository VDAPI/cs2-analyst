# Lessons Learned

## Parser Insights
<!-- Add findings about demoparser2 behavior, data quirks, etc. -->

## Architecture Decisions

### NextAuth catch-all intercepts custom routes
The `[...nextauth]` route at `/api/auth/[...nextauth]/route.ts` catches ALL requests under `/api/auth/*`, including custom routes like `/api/auth/link-faceit`. Custom OAuth flows must live outside `/api/auth/` — we use `/api/faceit/link` instead.

### FACEIT OAuth uses manual flow, not NextAuth provider
Adding FACEIT as a NextAuth provider caused issues: PrismaAdapter created duplicate users with FACEIT email, link-intent cookies got lost, and the signIn callback couldn't reliably distinguish "link account" from "login". Manual OAuth2 + PKCE flow at `/api/faceit/link` is simpler and more reliable for account linking.

### Server Components should query DB directly for fresh data
Session JWT tokens are only refreshed when `update()` is called client-side. For data that changes outside the session lifecycle (e.g., FACEIT linking), server components should query the DB with Prisma instead of relying on `session.user`. The Settings page is a server component that passes DB-fetched props to a client component.

## Performance Notes
<!-- Track performance observations and optimizations -->

## Bug Patterns

### FACEIT token exchange requires Basic Auth
FACEIT's token endpoint expects `Authorization: Basic base64(client_id:client_secret)` header. Sending client_id/client_secret in the POST body returns 401. This is the `client_secret_basic` auth method per OIDC spec.

### FACEIT demo CDN URLs are private
Demo URLs returned by the FACEIT match details API (`demo_url` field) point to a CDN that does not resolve publicly. Downloading demos requires the FACEIT Downloads API, which requires a separate application with ~30 day approval. Workaround: store match metadata only, let users upload demos manually.

### Self-signed HTTPS breaks cookie persistence in dev
Next.js `--experimental-https` generates a self-signed certificate. Browsers refuse to set `Secure` cookies on self-signed origins, breaking NextAuth session cookies and OAuth state cookies. Fix: override all NextAuth cookie settings with `secure: false` in dev, and set `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env` for server-side fetch.

### Server Components cannot have event handlers
React Server Components cannot pass `onClick`, `onChange`, or any event handler props. If you need interactivity (even `stopPropagation`), extract that element into a `"use client"` component or remove the handler if unnecessary.

### FACEIT API "from" parameter is unreliable
The FACEIT Data API `/players/{id}/history` endpoint's `from` query parameter does not reliably filter matches. Using `offset=0&limit=20` without `from` returns the latest matches correctly. Filter by date in application code if needed.
