import { FolderCheck, UploadCloud, Shield, CheckCircle } from "lucide-react";
import Pill, { Verdict } from "../components/Pill";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";

export default function Protection() {
  const { language } = useAppStore();

  const mockScans: {
    name: string;
    verdict: Verdict;
    size: string;
    time: string;
  }[] = [
    {
      name: "node-v22-win-x64.msi",
      verdict: "clean",
      size: "34.2 MB",
      time: "10 mins ago",
    },
    {
      name: "invoice_march.pdf.exe",
      verdict: "suspicious",
      size: "1.1 MB",
      time: "2 hours ago",
    },
    {
      name: "eicar_test_sample.com",
      verdict: "malicious",
      size: "68 bytes",
      time: "Yesterday",
    },
    {
      name: "archive_payload.zip",
      verdict: "clean",
      size: "4.8 MB",
      time: "2 days ago",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {translate("protection.title", language)}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {translate("protection.subtitle", language)}
        </p>
      </div>

      {/* Sentinel Status Banner */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">
              {translate("protection.watching", language)}
            </div>
            <div className="text-xs text-text-muted">
              {translate("protection.engine", language)}
            </div>
          </div>
        </div>
        <button className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:bg-border transition-colors">
          Manage Folders
        </button>
      </div>

      {/* Drag & Drop Scan Zone */}
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface/50 p-10 text-center hover:border-primary/50 transition-colors">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
          <UploadCloud className="h-6 w-6" />
        </div>
        <span className="text-sm font-semibold text-text">
          {translate("protection.dropTitle", language)}
        </span>
        <p className="text-xs text-text-muted mt-1">
          {translate("protection.dropSubtitle", language)}
        </p>
      </div>

      {/* Recent Scans Table */}
      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            {translate("protection.recentScans", language)}
          </h2>
          <span className="text-xs text-text-muted">
            <FolderCheck className="inline h-3.5 w-3.5 mr-1" />
            Active Monitor
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-text-muted font-medium border-b border-border">
              <tr>
                <th className="px-5 py-3">{translate("protection.fileName", language)}</th>
                <th className="px-5 py-3">{translate("protection.verdict", language)}</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">{translate("protection.time", language)}</th>
                <th className="px-5 py-3 text-right">{translate("protection.actions", language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-text">
              {mockScans.map((scan, idx) => (
                <tr key={idx} className="hover:bg-surface-2/40 transition-colors">
                  <td className="px-5 py-3 font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4 text-text-muted" />
                    {scan.name}
                  </td>
                  <td className="px-5 py-3">
                    <Pill verdict={scan.verdict} />
                  </td>
                  <td className="px-5 py-3 text-text-muted">{scan.size}</td>
                  <td className="px-5 py-3 text-text-muted">{scan.time}</td>
                  <td className="px-5 py-3 text-right">
                    <button className="rounded px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
