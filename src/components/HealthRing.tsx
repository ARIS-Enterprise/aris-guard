interface HealthRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export default function HealthRing({
  score,
  size = 140,
  strokeWidth = 10,
}: HealthRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let colorClass = "text-success stroke-current";
  if (score < 50) {
    colorClass = "text-danger stroke-current";
  } else if (score < 80) {
    colorClass = "text-warning stroke-current";
  }

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`PC Health Score: ${score} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-surface-2 fill-none"
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${colorClass} fill-none transition-all duration-700 ease-out`}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight text-text">
          {score}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Health
        </span>
      </div>
    </div>
  );
}
