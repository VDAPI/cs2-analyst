"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui";

export function DevLoginButton() {
  if (process.env.NEXT_PUBLIC_DEV_LOGIN !== "true") return null;

  return (
    <Button
      variant="danger"
      size="md"
      className="w-full"
      onClick={() =>
        signIn("credentials", {
          email: "dev@cs2analyst.local",
          password: "dev",
          callbackUrl: "/matches",
        })
      }
    >
      Dev Login (skip auth)
    </Button>
  );
}
