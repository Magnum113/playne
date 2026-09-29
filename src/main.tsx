import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Hub from "./Hub";
import { initTheme } from "./theme";
import { initMetrika } from "./analytics";
import "./style.css";

initMetrika();
initTheme();
const GamePage = /^\/naglaz\/?$/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{GamePage ? <App /> : <Hub />}</React.StrictMode>,
);
