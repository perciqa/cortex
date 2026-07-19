import type { Metadata } from "next";
import Script from "next/script";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";

const theme = createTheme({
  primaryColor: "blue",
  primaryShade: 6,
  fontFamily: "var(--font-inter), Inter, -apple-system, sans-serif",
  fontFamilyMonospace: "'GeistMono', 'Geist Mono', ui-monospace, monospace",
  defaultRadius: "sm",
  components: {
    Card: { defaultProps: { shadow: "xs", withBorder: true, radius: "md" } },
    Badge: { defaultProps: { radius: "sm" } },
    Table: { defaultProps: { highlightOnHover: true } },
  },
});

export const metadata: Metadata = {
  title: "Perciqa Console",
  description: "Unified console for Argus and Cortex.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="mantine-color-scheme" strategy="beforeInteractive">
          {`
            try {
              var _e = localStorage.getItem("mantine-color-scheme-value");
              var _cs = _e === "light" || _e === "dark" || _e === "auto" ? _e : "dark";
              var _ccs = _cs !== "auto" ? _cs : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
              document.documentElement.setAttribute("data-mantine-color-scheme", _ccs);
            } catch(e) {}
          `}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <Notifications position="top-right" zIndex={3000} containerWidth={360} />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
