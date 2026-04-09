import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
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

  return (
    <Suspense>
      <SettingsContent user={dbUser} />
    </Suspense>
  );
}
