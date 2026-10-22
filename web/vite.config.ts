import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        article: resolve(root, "article.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 8734,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8734,
    strictPort: true,
  },
})
