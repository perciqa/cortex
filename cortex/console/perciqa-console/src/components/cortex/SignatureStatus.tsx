"use client";

export interface SignatureStatusProps { sig?: string | null; label: string; }

export function SignatureStatus({ sig, label }: SignatureStatusProps) {
  const state = sig ? "pass" : "timeout";
  return (
    <span className={`status-badge ${state}`}>
      {sig ? "\u2713" : "\u2022"} {label}
    </span>
  );
}
