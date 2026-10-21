import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtext: string;
  icon: LucideIcon;
}

export default function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
}: StatCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-sm hover:border-border/80 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">{title}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3">
        <span className="text-xl font-semibold tracking-tight text-text">
          {value}
        </span>
        <p className="mt-1 text-xs text-text-muted">{subtext}</p>
      </div>
    </div>
  );
}
