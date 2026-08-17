import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The "@/*" alias must stay in sync with compilerOptions.paths in tsconfig.json —
// shadcn resolves components against it and refuses to run if the two disagree.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Vite ignores $PORT on its own; honoring it lets the dev-server harness
  // assign a free port (autoPort in .claude/launch.json) instead of failing
  // when 5173 is taken. strictPort so a clash fails loudly rather than
  // silently drifting from the port the harness expects.
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
});
