import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline, GlobalStyles } from "@mui/material";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import App from "./App";
import "./index.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#6366f1" },
    secondary: { main: "#8b5cf6" },
    success: { main: "#14b8a6" },
    error: { main: "#f43f5e" },
    warning: { main: "#f59e0b" },
    background: { default: "#12151b", paper: "#1b2029" },
  },
  typography: {
    fontFamily: '"IBM Plex Sans", -apple-system, sans-serif',
    h1: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
      fontSize: "2.25rem",
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 600,
      fontSize: "1.75rem",
      lineHeight: 1.25,
      letterSpacing: "-0.02em",
    },
    h3: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 600,
      fontSize: "1.375rem",
      lineHeight: 1.3,
    },
    h4: {
      fontFamily: '"IBM Plex Sans", sans-serif',
      fontWeight: 600,
      fontSize: "1.125rem",
    },
    h5: {
      fontFamily: '"IBM Plex Sans", sans-serif',
      fontWeight: 600,
      fontSize: "1rem",
    },
    h6: {
      fontFamily: '"IBM Plex Sans", sans-serif',
      fontWeight: 600,
      fontSize: "0.9375rem",
    },
    subtitle2: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 500,
      fontSize: "0.75rem",
      fontVariantNumeric: "tabular-nums",
    },
    body1: { fontWeight: 400, fontSize: "0.9375rem", lineHeight: 1.5 },
    body2: { fontWeight: 400, fontSize: "0.8125rem", lineHeight: 1.5 },
    caption: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: "0.6875rem",
      fontVariantNumeric: "tabular-nums",
    },
    overline: {
      fontFamily: '"IBM Plex Sans", sans-serif',
      fontWeight: 600,
      fontSize: "0.6875rem",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          "&:hover": {
            boxShadow: "0 1px 0 rgba(255,255,255,.04), 0 8px 24px -8px rgba(0,0,0,.7)",
            transform: "translateY(-2px)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", borderRadius: 8, fontWeight: 500 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 16 },
        label: { fontWeight: 500 },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { background: "#161a22", borderRight: "1px solid rgba(255,255,255,.06)" },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { background: "#161a22 !important", backgroundImage: "none !important" },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: "2px 8px",
          "&.Mui-selected": {
            background: "rgba(99,102,241,.15)",
            "&:hover": { background: "rgba(99,102,241,.2)" },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: { minWidth: 36, color: "#9aa4b6" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: "1px solid rgba(255,255,255,.06)" },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, background: "rgba(255,255,255,.06)" },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: { "& .MuiCircularProgress-track": { color: "rgba(255,255,255,.06)" } },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <GlobalStyles
      styles={{
        ".app-container": {
          position: "relative",
          minHeight: "100vh",
          "&::before": {
            content: '""',
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 100%)",
          },
          "&::after": {
            content: '""',
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            background:
              "radial-gradient(80% 60% at 50% 120%, hsl(var(--threat-hue, 190) 80% 50% / 0.08), transparent 70%)",
            transition: "background 1.2s ease",
          },
          "& > *": { position: "relative", zIndex: 1 },
        },
      }}
    />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ThemeProvider>
);
