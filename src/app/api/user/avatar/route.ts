import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

const MAX_BASE64_LENGTH = 4 * 1024 * 1024; // ~3MB base64 ≈ ~2MB image

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let image: string;
  try {
    const body = await req.json();
    image = typeof body.image === "string" ? body.image : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!image || image.length > MAX_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "Image must be a base64 data URI under 2MB" },
      { status: 400 }
    );
  }

  if (!image.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Invalid image format" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image },
  });

  return NextResponse.json({ success: true, image });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: null },
  });

  return NextResponse.json({ success: true });
}
