import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { getPlanUsage } from "@/lib/limits";
import { SettingsContent } from "./settings-content";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      plan: true,
      steamId: true,
      faceitId: true,
      faceitNickname: true,
    },
  });

  if (!dbUser) {
    redirect("/login");
  }

  const usage = await getPlanUsage(session.user.id);

  return (
    <Suspense>
      <SettingsContent
        user={dbUser}
        usage={{
          used: usage.used,
          monthlyLimit: Number.isFinite(usage.limit) ? usage.limit : null,
          keptDemos: usage.keptDemos,
          keptLimit: Number.isFinite(usage.limits.keptDemos) ? usage.limits.keptDemos : null,
          batchSize: usage.limits.batchSize,
          uploadFiles: usage.limits.uploadFiles,
        }}
      />
    </Suspense>
  );
}
