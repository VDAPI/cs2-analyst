"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** Upload pro demos to the pro pool, one request per file, then refresh the list. */
export function ProDemoUpload() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = [...files];
    let ok = 0;
    setProgress({ done: 0, total: list.length });
    for (const file of list) {
      const form = new FormData();
      form.set("file", file);
      // One label for a batch reads as "<label> · <file>"; a single file takes it as is.
      if (label.trim()) form.set("label", list.length > 1 ? `${label.trim()} · ${file.name.replace(/\.dem$/i, "")}` : label.trim());
      const res = await fetch("/api/admin/pro", { method: "POST", body: form }).catch(() => null);
      if (res?.ok) ok++;
      else toast({ title: t("norms.admin.failed", { name: file.name }), variant: "error" });
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
    if (ok > 0) toast({ title: t("norms.admin.uploaded", { n: ok }), variant: "success" });
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="label-overline text-[var(--text-tertiary)]">{t("norms.admin.label")}</span>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("norms.admin.labelPlaceholder")} maxLength={120} />
      </label>
      <input
        ref={fileRef}
        type="file"
        accept=".dem"
        multiple
        className="sr-only"
        onChange={(e) => void upload(e.target.files)}
        aria-label={t("norms.admin.choose")}
      />
      <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={progress != null} className="w-full sm:w-auto">
        <Upload className="h-4 w-4" aria-hidden />
        {progress ? t("norms.admin.uploading", progress) : t("norms.admin.choose")}
      </Button>
    </div>
  );
}

export function RefreshNormsButton() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/norms/refresh", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast({ title: t("common.error"), variant: "error" });
      return;
    }
    const data = (await res.json()) as { cells: number };
    toast({ title: t("norms.admin.refreshed", { cells: data.cells }), variant: "success" });
    router.refresh();
  };
  return (
    <Button variant="secondary" onClick={run} disabled={busy} className="w-full sm:w-auto">
      <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
      {busy ? t("norms.admin.refreshing") : t("norms.admin.refresh")}
    </Button>
  );
}

export function RemoveProDemoButton({ id }: { id: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!window.confirm(t("norms.admin.removeConfirm"))) return;
    setBusy(true);
    const res = await fetch(`/api/admin/pro/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast({ title: t("common.error"), variant: "error" });
      return;
    }
    toast({ title: t("norms.admin.removed"), variant: "success" });
    router.refresh();
  };
  return (
    <Button variant="ghost" size="sm" onClick={run} disabled={busy} aria-label={t("norms.admin.remove")}>
      <Trash2 className="h-3.5 w-3.5" aria-hidden />
      <span className="max-sm:sr-only">{t("norms.admin.remove")}</span>
    </Button>
  );
}
