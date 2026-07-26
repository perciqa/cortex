import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
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
    background: { default: "#0f0f11", paper: "#1a1a1e" },
  },
  typography: {
    fontFamily: "Inter, -apple-system, sans-serif",
    h1: { fontWeight: 700, fontSize: "2.25rem", lineHeight: 1.2 },
    h2: { fontWeight: 600, fontSize: "1.75rem", lineHeight: 1.25 },
    h3: { fontWeight: 600, fontSize: "1.375rem", lineHeight: 1.3 },
    body1: { fontWeight: 400, fontSize: "0.9375rem", lineHeight: 1.5 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          "&:hover": {
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            transform: "translateY(-2px)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", borderRadius: 8 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 16 },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ThemeProvider>
);
