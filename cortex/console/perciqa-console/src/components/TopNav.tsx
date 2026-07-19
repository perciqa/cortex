"use client";
import { useEffect, useState, startTransition } from "react";
import { ActionIcon, useMantineColorScheme } from "@mantine/core";
import { IconSearch, IconSun, IconMoon } from "@tabler/icons-react";

export function TopNav() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { startTransition(() => setMounted(true)); }, []);

  return (
    <nav className="topnav">
      <div className="topnav-search">
        <div className="topnav-search-inner">
          <input
            type="search"
            placeholder="Search traces, agents…"
            className="topnav-search-input"
          />
          <button type="button" className="topnav-search-btn" aria-label="Search">
            <IconSearch size={16} />
          </button>
        </div>
      </div>

      <div className="topnav-right">
        <ActionIcon
          variant="subtle"
          size="md"
          onClick={() =>
            setColorScheme(colorScheme === "dark" ? "light" : "dark")
          }
          aria-label="Toggle theme"
          color="gray"
        >
          {mounted && colorScheme === "dark" ? (
            <IconSun size={18} />
          ) : (
            <IconMoon size={18} />
          )}
        </ActionIcon>
        <span
          style={{
            fontSize: 12,
            fontFamily: "var(--lato)",
            background: "var(--light-blue)",
            color: "var(--blue)",
            padding: "4px 12px",
            borderRadius: 20,
            fontWeight: 600,
          }}
        >
          Console · Alpha
        </span>
      </div>
    </nav>
  );
}
