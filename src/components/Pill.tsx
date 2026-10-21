import { Check, Info, AlertTriangle, ShieldAlert, HelpCircle } from "lucide-react";

export type Verdict =
  | "clean"
  | "low_risk"
  | "suspicious"
  | "malicious"
  | "unknown";

interface PillProps {
  verdict: Verdict;
  label?: string;
}

export default function Pill({ verdict, label }: PillProps) {
  switch (verdict) {
    case "clean":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
          <Check className="h-3 w-3" />
          {label || "Clean"}
        </span>
      );
    case "low_risk":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
          <Info className="h-3 w-3" />
          {label || "Low Risk"}
        </span>
      );
    case "suspicious":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
          <AlertTriangle className="h-3 w-3" />
          {label || "Suspicious"}
        </span>
      );
    case "malicious":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-medium text-danger">
          <ShieldAlert className="h-3 w-3" />
          {label || "Malicious"}
        </span>
      );
    case "unknown":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-muted">
          <HelpCircle className="h-3 w-3" />
          {label || "Unknown"}
        </span>
      );
  }
}
