import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Hub from "./Hub";
import CircleGame from "./CircleGame";
import ColorfleGame from "./ColorfleGame";
import { initTheme } from "./theme";
import { initMetrika } from "./analytics";
import "./style.css";

initMetrika();
initTheme();
const ColorPage = /^\/colorfle\/?$/.test(window.location.pathname);
const CirclePage = /^\/circle\/?$/.test(window.location.pathname);
const GamePage = /^\/naglaz\/?$/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {GamePage ? (
      <App />
    ) : CirclePage ? (
      <CircleGame />
    ) : ColorPage ? (
      <ColorfleGame />
    ) : (
      <Hub />
    )}
  </React.StrictMode>,
);
