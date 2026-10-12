# CS2 Analyst image for the local test environment (S20): one image for the
# app (`next start`), the workers and the one-off setup. docker-compose.yml
# builds it; see docs/TESTOWANIE.md.
#
# Debian (glibc), not Alpine: demoparser2 ships linux-x64-gnu and
# linux-arm64-gnu builds (Intel/AMD PCs and Apple Silicon Macs). The full
# image, not -slim: it already has openssl (Prisma's query engine) and CA
# certificates (FACEIT/Steam/Anthropic APIs), so the build needs no apt.
FROM node:22-bookworm

# npm 10 is pinned (see "npm 10 is pinned" in CLAUDE.md).
RUN npm install -g npm@10

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first so code changes don't reinstall them. Dev dependencies
# stay: the workers and scripts run through tsx, setup through the Prisma CLI.
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
