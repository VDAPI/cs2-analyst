import type { Plan } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      steamId: string | null;
      plan: Plan;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
