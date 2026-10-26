import { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Trash2,
  RotateCcw,
  RefreshCw,
  Loader2,
  Check,
  FileWarning,
} from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";
import {
  QuarantineItem,
  listQuarantinedItems,
  restoreQuarantinedItem,
  deleteQuarantinedItem,
} from "../lib/ipc";

export default function Quarantine() {
  const { language, setActivePage, refreshAllData } = useAppStore();
  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const loadItems = async () => {
    try {
      setLoading(true);
      const list = await listQuarantinedItems();
      setItems(list);
      setLoading(false);
    } catch (err) {
      console.error("Failed loading quarantine items:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleRestore = async (item: QuarantineItem) => {
    try {
      setActionId(item.id);
      const msg = await restoreQuarantinedItem(item.id);
      setFeedbackMsg(msg);
      await loadItems();
      await refreshAllData();
      setActionId(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error("Restore failed:", err);
      setActionId(null);
    }
  };

  const handleDelete = async (item: QuarantineItem) => {
    try {
      setActionId(item.id);
      const msg = await deleteQuarantinedItem(item.id);
      setFeedbackMsg(msg);
      await loadItems();
      await refreshAllData();
      setActionId(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error("Delete failed:", err);
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {translate("quarantine.title", language)}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {translate("quarantine.subtitle", language)}
          </p>
        </div>
        <button
          onClick={loadItems}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-2 active:scale-95 transition-all"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-text-muted ${loading ? "animate-spin" : ""}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Feedback Banner */}
      {feedbackMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-medium text-success transition-all animate-in fade-in">
          <Check className="h-4 w-4 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Main Items View */}
      {items.length === 0 ? (
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
            <span>Scan Files Now</span>
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-2/30">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text">
                Detained Threat Vault
              </span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-text-muted">
                {items.length} items
              </span>
            </div>
            <span className="text-xs text-text-muted flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
              Isolated & Encrypted (XOR 0x5A)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-text-muted font-medium border-b border-border">
                <tr>
                  <th className="px-5 py-3">Threat Name</th>
                  <th className="px-5 py-3">Detection Reason</th>
                  <th className="px-5 py-3">Size</th>
                  <th className="px-5 py-3">Detained At</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-text">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="px-5 py-3.5 max-w-xs">
                      <div className="flex items-center gap-2.5 truncate">
                        <FileWarning className="h-4 w-4 text-danger shrink-0" />
                        <div className="truncate">
                          <div className="font-semibold text-text truncate">
                            {item.file_name}
                          </div>
                          <div className="text-[11px] text-text-muted font-mono truncate max-w-xs">
                            {item.original_path}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-text-muted max-w-xs truncate">
                      <span className="rounded bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger border border-danger/20">
                        {item.reason}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-text-muted font-mono text-[11px]">
                      {item.size_formatted}
                    </td>
                    <td className="px-5 py-3.5 text-text-muted">
                      {item.quarantined_at.includes("T")
                        ? item.quarantined_at.split("T")[0]
                        : item.quarantined_at}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRestore(item)}
                          disabled={actionId === item.id}
                          className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all disabled:opacity-50"
                          title="Restore file back to original location"
                        >
                          {actionId === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3 text-success" />
                          )}
                          <span>Restore</span>
                        </button>

                        <button
                          onClick={() => handleDelete(item)}
                          disabled={actionId === item.id}
                          className="flex items-center gap-1 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger/20 active:scale-95 transition-all disabled:opacity-50"
                          title="Permanently wipe file from disk"
                        >
                          {actionId === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Card */}
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
