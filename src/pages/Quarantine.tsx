import { ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";

export default function Quarantine() {
  const { language, setActivePage } = useAppStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {translate("quarantine.title", language)}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {translate("quarantine.subtitle", language)}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-12 text-center shadow-sm space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-text">
            {translate("quarantine.empty", language)}
          </h2>
          <p className="mt-1 text-xs text-text-muted max-w-sm">
            {translate("quarantine.emptySubtitle", language)}
          </p>
        </div>

        <button
          onClick={() => setActivePage("protection")}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Scan Files Now
        </button>
      </div>

      <div className="rounded-xl border border-border/80 bg-surface/50 p-4 text-xs text-text-muted flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-text">How Quarantine Works:</span>{" "}
          When a downloaded file exhibits malicious signatures or dangerous payload
          traits, ARIS Guard revokes its execution permissions and isolates it into
          an encrypted, secure vault. You can review, permanently delete, or restore
          any item at any time.
        </div>
      </div>
    </div>
  );
}
