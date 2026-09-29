import React from "react";
import { createRoot } from "react-dom/client";
import Site from "./Site";
import { initTheme } from "./theme";
import { initMetrika } from "./analytics";
import "./style.css";

initMetrika();
initTheme();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Site path={window.location.pathname} />
  </React.StrictMode>,
);
