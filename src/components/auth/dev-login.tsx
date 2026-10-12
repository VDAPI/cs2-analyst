"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

export function DevLoginButton() {
  const t = useT();
  if (process.env.NEXT_PUBLIC_DEV_LOGIN !== "true") return null;

  return (
    <Button
      variant="secondary"
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
      {t("auth.devLogin")}
    </Button>
  );
}
