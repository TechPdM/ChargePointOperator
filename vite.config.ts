import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // PORT wins when it is set, so a second session can run its own dev server
  // without fighting the first for 5273.
  server: { port: Number(process.env.PORT) || 5273 },
});
