"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** The browser offered an install prompt we can trigger. */
  canInstall: boolean;
  /** Running as the installed app (standalone window). */
  installed: boolean;
  /** iOS Safari: no prompt API, the player adds the app from the Share menu. */
  isIos: boolean;
  promptInstall: () => Promise<boolean>;
}

const PwaContext = createContext<PwaState>({
  canInstall: false,
  installed: false,
  isIos: false,
  promptInstall: async () => false,
});

export function usePwa() {
  return useContext(PwaContext);
}

/**
 * Registers the service worker (public/sw.js) and keeps the install prompt
 * so the Settings screen can offer "Install the app" (S18).
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const url = process.env.NODE_ENV === "development" ? "/sw.js?dev=1" : "/sw.js";
      navigator.serviceWorker.register(url, { scope: "/" }).catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  }, [deferred]);

  return (
    <PwaContext.Provider value={{ canInstall: Boolean(deferred), installed, isIos, promptInstall }}>
      {children}
    </PwaContext.Provider>
  );
}
