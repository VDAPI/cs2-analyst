import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let name: string;
  try {
    const body = await req.json();
    name = typeof body.name === "string" ? body.name.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!name || name.length > 50) {
    return NextResponse.json(
      { error: "Name must be 1-50 characters" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name },
  });

  return NextResponse.json({ success: true, name });
}
