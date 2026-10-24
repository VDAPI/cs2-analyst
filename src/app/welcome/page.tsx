import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { NicknameForm } from "@/components/auth/nickname-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.welcomeMetaTitle") };
}

/** NextAuth `pages.newUser`: the first Steam sign-in lands here to pick a nickname. */
export default async function WelcomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } });
  const { t } = await getT();
  return (
    <AuthShell title={t("auth.welcomeTitle")} subtitle={t("auth.welcomeSubtitle")} footer={t("auth.welcomeLater")}>
      <NicknameForm initialName={user?.name ?? ""} />
    </AuthShell>
  );
}
