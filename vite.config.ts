import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { fileURLToPath } from "node:url"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      // The pinned fixed-via package is consumed from source and imports
      // bare `assets/...` paths. Alias them so cosmos-export/Vite can resolve.
      "assets/FixedViaHypergraphSolver": fileURLToPath(
        new URL(
          "./node_modules/@tscircuit/fixed-via-hypergraph-solver/assets/FixedViaHypergraphSolver",
          import.meta.url,
        ),
      ),
    },
  },
})
