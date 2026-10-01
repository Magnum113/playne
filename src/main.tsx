import React from "react";
import { createRoot } from "react-dom/client";
import Site from "./Site";
import { initTheme } from "./theme";
import { initMetrika } from "./analytics";
import "./style.css";

initMetrika();
initTheme();
const root = document.getElementById("root")!;
// Preserve the prerendered route when a preview service proxies the document
// under its own URL. Development pages still use the browser's pathname.
createRoot(root).render(
  <React.StrictMode>
    <Site path={root.dataset.pagePath ?? window.location.pathname} />
  </React.StrictMode>,
);
