import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { Card, PageHeader, UserAvatar } from "@/components/ui";
import { AcceptInviteButton } from "@/components/friends/friend-actions";
import { findFriendship, isFriendCode } from "@/lib/friends/load";

interface Props {
  params: Promise<{ code: string }>;
}

/** /friends/add/<code> — a friend's invite link: shows who sent it, one tap adds them (S25). */
export default async function AddFriendPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  // The middleware sends signed-out visitors to /login and back here.
  if (!session?.user?.id) redirect("/login");
  const { code } = await params;
  if (!isFriendCode(code)) notFound();
  const { t } = await getT();
  const owner = await prisma.user.findUnique({
    where: { friendCode: code },
    select: { id: true, name: true, image: true, faceitNickname: true },
  });
  if (!owner) notFound();
  if (owner.id === session.user.id) redirect("/friends");
  const existing = await findFriendship(prisma, session.user.id, owner.id);
  if (existing?.status === "accepted") redirect("/friends");
  const name = owner.name?.trim() || owner.faceitNickname || t("friends.someone");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader eyebrow={t("friends.eyebrow")} title={t("friends.inviteTitle")} />
      <Card className="space-y-4 text-center">
        <UserAvatar name={name} image={owner.image} size="lg" className="mx-auto" />
        <p className="font-display text-xl font-semibold text-[var(--text-primary)]">{name}</p>
        <p className="text-sm text-[var(--text-secondary)]">{t("friends.inviteBody", { name })}</p>
        <div className="flex justify-center">
          <AcceptInviteButton code={code} name={name} />
        </div>
      </Card>
    </div>
  );
}
