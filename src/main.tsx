import React from "react";
import { createRoot } from "react-dom/client";
import Site from "./Site";
import { AuthProvider } from "./account";
import "./style.css";
import "./community.css";
import "./ui.css";
import "./overall.css";
import "./game-start.css";
import { initTheme } from "./theme";
import { initMetrika } from "./analytics";

import {
  captureEmailNavigation,
  initEmailReturnTracking,
} from "./emailNavigation";

captureEmailNavigation();
const root = document.getElementById("root")!;
// Sprite Fusion marks its copied document and rewrites image URLs to its proxy.
// Keep that static markup: rerendering would replace the rewritten image URLs
// with /art/... on the service's own domain. The copy is only a game backdrop.
if (!document.querySelector('meta[name="daw-status"]')) {
  initMetrika();
  initEmailReturnTracking();
  initTheme();
  createRoot(root).render(
    <React.StrictMode>
      <AuthProvider>
        <Site path={root.dataset.pagePath ?? window.location.pathname} />
      </AuthProvider>
    </React.StrictMode>,
  );
}
