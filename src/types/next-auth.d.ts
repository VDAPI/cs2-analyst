import type { Plan } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      steamId: string | null;
      faceitId: string | null;
      faceitNickname: string | null;
      plan: Plan;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    steamId: string | null;
    faceitId: string | null;
    faceitNickname: string | null;
    plan: Plan;
  }
}
