import { useEffect, useState } from "react";

const DISMISS_KEY = "chakulafast-install-dismissed-until";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard) flag — display-mode media query
    // support for standalone PWAs came later and isn't reliable pre-iOS 13.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports its platform as "MacIntel" to pass itself off as
  // desktop Safari — the giveaway is touch support, which no real Mac has.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/**
 * There is no web API to trigger "Add to Home Screen" on iOS — Apple has
 * never exposed one, on any iOS browser (they're all WebKit under the
 * hood). `beforeinstallprompt` is Chromium-only. So this hook exposes two
 * different capabilities rather than pretending they're the same thing:
 *   - `promptInstall()` — a real native install prompt, Android/Chrome only
 *   - `platform === "ios"` — the caller shows manual instructions instead,
 *     since that's the only thing Apple allows
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() < until;
  });

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const platform: "android" | "ios" | null = deferredPrompt ? "android" : isIOS() ? "ios" : null;

  const canPrompt = !installed && !dismissed && platform !== null;

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "dismissed") dismiss();
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
    } catch {
      // Private-mode Safari can throw on localStorage writes; the dismissal
      // just won't persist across reloads, which is an acceptable fallback.
    }
  };

  return { canPrompt, platform, promptInstall, dismiss };
}
