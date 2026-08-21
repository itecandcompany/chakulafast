import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useT } from "@/lib/i18n";

/**
 * Global floating install banner. Android gets a real one-tap install via
 * `beforeinstallprompt`; iOS has no such API (Apple doesn't expose one on
 * any iOS browser), so tapping Install there opens a small instruction
 * card for the manual Share -> Add to Home Screen steps instead.
 */
export default function InstallBanner() {
  const t = useT();
  const { canPrompt, platform, promptInstall, dismiss } = useInstallPrompt();
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (!canPrompt) return null;

  const handleInstallClick = () => {
    if (platform === "android") promptInstall();
    else setShowIosSteps(true);
  };

  return (
    // Deliberately not `position: fixed` — every route already has its own
    // sticky `top-0` header, and a fixed overlay here would sit on top of
    // it rather than push it down (confirmed: it visually covered the
    // Orders page header). Sitting in normal flow, above everything else in
    // the root layout, means it pushes all page content down instead —
    // no overlap is possible regardless of what a given route renders.
    <div className="relative z-[1500] flex justify-center px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border bg-card/95 p-3 shadow-elegant backdrop-blur">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-primary text-sm font-bold text-primary-foreground">
          C
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{t("install.title")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("install.subtitle")}</p>
        </div>
        <Button size="sm" className="h-9 shrink-0 px-3" onClick={handleInstallClick}>
          <Download className="h-3.5 w-3.5" />
          {t("install.button")}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("install.dismiss")}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {showIosSteps && (
        <div
          className="fixed inset-0 z-[1600] grid place-items-end bg-black/40 p-3 sm:place-items-center"
          onClick={() => setShowIosSteps(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-elegant"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-bold">{t("install.iosTitle")}</p>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Share className="h-3.5 w-3.5" />
                </span>
                {t("install.iosStep1")}
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <SquarePlus className="h-3.5 w-3.5" />
                </span>
                {t("install.iosStep2")}
              </li>
            </ol>
            <Button className="mt-4 w-full h-11" onClick={() => setShowIosSteps(false)}>
              {t("install.gotIt")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
