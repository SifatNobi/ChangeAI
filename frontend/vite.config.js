const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "esbuild",
    cssCodeSplit: true,
    rollupOptions: {
      input: "index.html",
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "vendor";
            if (id.includes("qrcode")) return "qrcode";
          }
        }
      }
    },
    target: "esnext",
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
