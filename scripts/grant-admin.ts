/**
 * Promote existing accounts to admin (role ADMIN). This is how the first
 * admin gets in: emails are not verified, so `ADMIN_EMAILS` never grants
 * admin by itself at runtime (anyone could register a listed address).
 *
 * Run on the server, after the account has been registered and logged in:
 *   npm run admin:grant -- owner@example.com [other@example.com ...]
 *   npm run admin:grant            # every address in ADMIN_EMAILS
 *
 * The role is set immediately; the output shows each account's id, creation
 * date and sign-in methods so you can check it is really yours (an address
 * on ADMIN_EMAILS registered before you did would belong to someone else).
 * Revoke in /admin/users or by setting the role back in the DB.
 */
import { PrismaClient } from "@prisma/client";
import { parseAdminEmails } from "../src/lib/admin/access";
import { normalizeEmail } from "../src/lib/email";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2).map(normalizeEmail).filter(Boolean);
  const emails = args.length > 0 ? args : parseAdminEmails(process.env.ADMIN_EMAILS);
  if (emails.length === 0) {
    console.error("Usage: npm run admin:grant -- <email> [...]  (or set ADMIN_EMAILS)");
    process.exitCode = 1;
    return;
  }

  for (const email of emails) {
    const matches = await prisma.user.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        password: true,
        steamId: true,
        accounts: { select: { provider: true } },
      },
    });
    if (matches.length === 0) {
      console.log(`- ${email}: no account (register it first, then run this again)`);
      continue;
    }
    if (matches.length > 1) {
      console.log(`- ${email}: ${matches.length} accounts differ only by letter case; promote one by its exact id in /admin or the DB`);
      for (const u of matches) console.log(`    ${u.id}  ${u.email}  created ${u.createdAt.toISOString()}`);
      continue;
    }
    const user = matches[0];
    const methods = [
      user.password ? "password" : null,
      ...user.accounts.map((a) => a.provider),
    ].filter(Boolean);
    if (user.role === "ADMIN") {
      console.log(`- ${user.email}: already admin`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    console.log(
      `- ${user.email}: now ADMIN (id ${user.id}, created ${user.createdAt.toISOString()}, sign-in: ${methods.join(", ") || "none"})`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
