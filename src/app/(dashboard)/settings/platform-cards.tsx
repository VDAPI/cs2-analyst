"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, Download, Smartphone } from "lucide-react";
import { Badge, Button, Card, CardHeader, useToast } from "@/components/ui";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { usePwa } from "@/components/pwa/pwa-provider";
import { useT } from "@/lib/i18n/client";
import {
  disablePush,
  enablePush,
  getPushState,
  type PushState,
} from "@/lib/notifications/push-client";

/** Settings → language (S18). */
export function LanguageCard() {
  const t = useT();
  return (
    <Card>
      <CardHeader
        title={t("language.title")}
        description={t("language.description")}
        action={<LanguageSwitcher />}
      />
    </Card>
  );
}

/** Settings → "analysis ready" push notifications on this device (S18). */
export function PushCard() {
  const t = useT();
  const toast = useToast();
  const { isIos, installed } = usePwa();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      setState(state === "on" ? await disablePush() : await enablePush());
    } catch {
      toast({ title: t("push.failed"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      toast({ title: res.ok ? t("push.testSent") : t("common.error"), variant: res.ok ? "success" : "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("push.title")}
        description={t("push.description")}
        action={
          state === "on" ? (
            <Badge variant="success">{t("push.enabled")}</Badge>
          ) : state === "off" ? (
            <Badge variant="neutral">{t("push.disabled")}</Badge>
          ) : undefined
        }
      />
      <div className="space-y-3">
        {state === "unsupported" && (
          <p className="text-sm text-[var(--text-secondary)]">
            {isIos && !installed ? t("push.iosHint") : t("push.unsupported")}
          </p>
        )}
        {state === "denied" && <p className="text-sm text-[var(--warning)]">{t("push.denied")}</p>}
        {(state === "on" || state === "off") && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant={state === "on" ? "secondary" : "primary"}
              onClick={toggle}
              disabled={busy}
            >
              <BellRing className="h-4 w-4" aria-hidden />
              {state === "on" ? t("push.disable") : busy ? t("push.enabling") : t("push.enable")}
            </Button>
            {state === "on" && (
              <Button variant="ghost" onClick={sendTest} disabled={busy}>
                {t("push.test")}
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-[var(--text-tertiary)]">{t("push.inApp")}</p>
      </div>
    </Card>
  );
}

/** Settings → install as an app (PWA, S18). */
export function InstallCard() {
  const t = useT();
  const toast = useToast();
  const { canInstall, installed, isIos, promptInstall } = usePwa();

  return (
    <Card>
      <CardHeader
        title={t("pwa.title")}
        description={t("pwa.description")}
        action={<Smartphone className="h-5 w-5 text-[var(--accent)]" aria-hidden />}
      />
      {installed ? (
        <p className="flex items-center gap-2 text-sm text-[var(--good)]">
          <Check className="h-4 w-4" aria-hidden /> {t("pwa.installed")}
        </p>
      ) : (
        <div className="space-y-3">
          {canInstall && (
            <Button
              variant="primary"
              onClick={async () => {
                if (await promptInstall()) toast({ title: t("pwa.installedToast"), variant: "success" });
              }}
            >
              <Download className="h-4 w-4" aria-hidden /> {t("pwa.install")}
            </Button>
          )}
          {isIos ? (
            <p className="text-sm text-[var(--text-secondary)]">{t("pwa.iosSteps")}</p>
          ) : (
            !canInstall && <p className="text-sm text-[var(--text-secondary)]">{t("pwa.otherBrowsers")}</p>
          )}
        </div>
      )}
    </Card>
  );
}
