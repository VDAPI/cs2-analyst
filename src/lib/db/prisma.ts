import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * DB_QUERY_LOG=1 prints every query with its time (`[db] 3 ms SELECT …`), to
 * count and time a page's queries (S28). Off by default.
 */
function createClient(): PrismaClient {
  if (process.env.DB_QUERY_LOG !== "1") return new PrismaClient();
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  client.$on("query", (e) => {
    console.log(`[db] ${e.duration} ms ${e.query.slice(0, 160).replace(/\s+/g, " ")}`);
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
