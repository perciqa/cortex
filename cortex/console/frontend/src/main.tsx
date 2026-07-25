import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import App from "./App";
import "./index.css";

const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily: "Inter, -apple-system, sans-serif",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </MantineProvider>
);
