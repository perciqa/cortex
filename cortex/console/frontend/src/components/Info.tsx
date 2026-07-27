import { useState, useId, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { GlossaryKey } from "../data/glossary";

import { GLOSSARY } from "../data/glossary";
const entries: Record<string, { term: string; plain: string; eg?: string }> = GLOSSARY;

export function Info({ k, entry }: { k?: GlossaryKey; entry?: { term: string; plain: string; eg?: string } }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const g = entry || (k ? entries[k] : null);
  if (!g) return null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <Box component="span" sx={{ position: "relative", display: "inline-flex", verticalAlign: "middle", lineHeight: 1 }}>
      <Box
        component="button"
        aria-label={`Explain: ${g.term}`}
        aria-describedby={open ? id : undefined}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(o => !o)}
        sx={{
          display: "inline-grid", placeItems: "center", width: 16, height: 16,
          color: "#8a94a8", borderRadius: "50%", cursor: "help",
          bgcolor: "transparent", border: "none", p: 0,
          transition: "color 0.14s cubic-bezier(.22,.61,.36,1)",
          "&:hover, &:focus-visible": { color: "#34d6c8", outline: "none" },
          "& svg": { display: "block" },
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 7v4M8 4.6v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </Box>
      {open && (
        <Box
          ref={popRef}
          role="tooltip"
          id={id}
          tabIndex={-1}
          sx={{
            position: "absolute", left: "50%", top: "calc(100% + 8px)",
            transform: "translateX(-50%)",
            width: 248, zIndex: 1500, p: "8px 12px",
            borderRadius: "var(--r-md, 10px)",
            bgcolor: "var(--bg-peak, #242c3a)",
            border: "1px solid rgba(150,170,200,.16)",
            boxShadow: "0 1px 0 rgba(255,255,255,.04), 0 8px 24px -8px rgba(0,0,0,.7)",
            display: "flex", flexDirection: "column", gap: "4px",
          }}
        >
          <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: "0.6875rem", letterSpacing: "0.04em", color: "#34d6c8" }}>
            {g.term}
          </Typography>
          <Typography sx={{ fontFamily: '"IBM Plex Sans", sans-serif', fontWeight: 400, fontSize: "0.78125rem", lineHeight: 1.45, color: "#c2cbda" }}>
            {g.plain}
          </Typography>
          {g.eg && (
            <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 400, fontSize: "0.71875rem", lineHeight: 1.4, color: "#8a94a8", fontStyle: "normal" }}>
              {g.eg}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
