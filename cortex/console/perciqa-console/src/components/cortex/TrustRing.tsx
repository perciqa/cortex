"use client";

export interface TrustRingProps { pct: number; }

export function TrustRing({ pct }: TrustRingProps) {
  const v = Math.max(0, Math.min(100, Math.round(pct * 100)));
  const cls = v >= 70 ? "trust-high" : v >= 40 ? "trust-medium" : "trust-low";

  return (
    <div className="relative w-12 h-12 inline-flex items-center justify-center">
      <svg viewBox="0 0 36 36" className="w-12 h-12">
        <circle cx="18" cy="18" r="16" fill="none" stroke="var(--grey)" strokeWidth="4" />
        <circle cx="18" cy="18" r="16" fill="none"
          className={cls}
          strokeWidth="4" strokeDasharray={`${v}, 100`} strokeLinecap="round"
          transform="rotate(-90 18 18)" />
      </svg>
      <span className={`absolute text-xs font-semibold ${cls}`}>{v}</span>
    </div>
  );
}
