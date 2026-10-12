"use client";

import { Copy } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** Copies a lineup's setpos/setang command to the clipboard. */
export function CopySetpos({ command }: { command: string }) {
  const t = useT();
  const toast = useToast();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          toast({ title: t("lineups.copied"), description: command, variant: "success" });
        } catch {
          toast({ title: t("lineups.copyFailed"), variant: "error" });
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" aria-hidden />
      {t("lineups.copy")}
    </Button>
  );
}
