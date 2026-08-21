import { Languages } from "lucide-react";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";

/**
 * Segmented English/Kiswahili toggle. Rendered as real radio inputs so it's
 * keyboard- and screen-reader-navigable, with the visual treatment carried by
 * peer-checked styling rather than a div-with-onClick.
 */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const codes = Object.keys(LANGS) as Lang[];

  return (
    <fieldset className={className}>
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Languages className="h-4 w-4 text-muted-foreground" />
        {t("common.language")}
      </legend>
      <div className="flex gap-1 rounded-xl border bg-muted p-1">
        {codes.map((code) => (
          <label key={code} className="flex-1">
            <input
              type="radio"
              name="app-language"
              value={code}
              checked={lang === code}
              onChange={() => setLang(code)}
              className="peer sr-only"
            />
            <span className="block cursor-pointer rounded-lg px-3 py-2 text-center text-[13px] font-medium text-foreground/80 transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-background/60 peer-checked:hover:bg-primary">
              {LANGS[code]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
