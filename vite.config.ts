import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { devApiPlugin } from "./server/dev-api-plugin"

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Runs the /api routes locally; on Vercel they run as a serverless function (api/index.ts).
    devApiPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "#": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    watch: {
      // The local API writes its JSON files here on every change. Without
      // this, Vite would reload the page on each write and wipe its state.
      ignored: ["**/.data/**", "**/*.tsbuildinfo"],
    },
  },
})
