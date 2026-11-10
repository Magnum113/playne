import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        comments: { legal: true },
        banner: `/*! @license React Bits ElectricBorder
${readFileSync(new URL("./licenses/react-bits-electric-border.md", import.meta.url), "utf8")}*/`,
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3035",
      "/challenge/": "http://127.0.0.1:3035",
      "/c/": "http://127.0.0.1:3035",
    },
  },
});
