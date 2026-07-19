"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard,
  IconTimeline,
  IconCoins,
  IconChartBar,
  IconEye,
  IconActivity,
  IconCopy,
  IconCheck,
  IconCpu,
  IconNews,
  IconGitFork,
  IconFilter,
  IconDeviceDesktopAnalytics,
  IconShieldExclamation,
} from "@tabler/icons-react";

const NAV = [
  {
    section: "Argus",
    items: [
      { href: "/argus",              label: "Overview", icon: IconLayoutDashboard },
      { href: "/argus/traces",       label: "Traces",   icon: IconTimeline },
      { href: "/argus/finops",       label: "FinOps",   icon: IconCoins },
      { href: "/argus/evals",        label: "Evals",    icon: IconChartBar },
    ],
  },
  {
    section: "Cortex",
    items: [
      { href: "/cortex",             label: "Fabric Overview", icon: IconCpu },
      { href: "/cortex/feed",        label: "Article Feed",    icon: IconNews },
      { href: "/cortex/provenance",  label: "Provenance",      icon: IconGitFork },
      { href: "/cortex/scope",       label: "Scope Filter",    icon: IconFilter },
      { href: "/cortex/bench",       label: "Bench Panel",     icon: IconDeviceDesktopAnalytics },
      { href: "/cortex/attack",      label: "Attack Matrix",   icon: IconShieldExclamation },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setApiKey(d.api_key || ""))
      .catch(() => {});
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <section id="sidebar" className="sidebar">
      <Link href="/" className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <IconEye size={22} color="#3C91E6" stroke={2} />
        </div>
        <div className="sidebar-logo-text-wrap">
          <span className="sidebar-logo-name">Perciqa Console</span>
          <span className="sidebar-logo-sub">by Perciqa</span>
        </div>
      </Link>

      <nav className="sidebar-nav">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <span className="sidebar-section-label">{section}</span>
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <div
                  key={href}
                  className={`sidebar-nav-item-wrap ${active ? "active" : ""}`}
                >
                  <Link href={href} className="sidebar-nav-item">
                    <span className="nav-icon">
                      <Icon size={18} stroke={1.8} />
                    </span>
                    <span className="nav-label">{label}</span>
                  </Link>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-api-key">
        <span className="sidebar-api-key-label">API Key</span>
        <button
          type="button"
          className="sidebar-api-key-value"
          onClick={handleCopy}
          title="Copy API key"
        >
          <span>{apiKey || "••••••••••••••••"}</span>
          {copied ? (
            <IconCheck size={12} stroke={2} />
          ) : (
            <IconCopy size={12} stroke={2} />
          )}
        </button>
      </div>

      <div className="sidebar-footer">
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <IconActivity size={11} />
          v0.1.0-alpha
        </span>
        <span>MIT</span>
      </div>
    </section>
  );
}
