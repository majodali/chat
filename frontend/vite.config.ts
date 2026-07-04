import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The app is served from https?://liddle.cloud/chat/, so all asset URLs and
  // the runtime config fetch must be relative to the /chat/ base path.
  base: "/chat/",
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
