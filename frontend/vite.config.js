const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  plugins: [react({
    fastRefresh: true,
  })],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: false,
      },
      mangle: true,
    },
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      input: "index.html",
      output: {
        manualChunks(id) {
          // Core dependencies
          if (id.includes("node_modules")) {
            if (id.includes("react") && !id.includes("react-router")) {
              return "vendor-react";
            }
            if (id.includes("react-router")) {
              return "vendor-router";
            }
            if (id.includes("qrcode") || id.includes("html5-qrcode")) {
              return "qr-libs";
            }
          }
          
          // Layout components
          if (id.includes("stitch/components") || id.includes("AppLayout")) {
            return "layout";
          }
        }
      }
    },
    target: "es2020",
    chunkSizeWarningLimit: 600,
    modulePreload: {
      polyfill: true
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    headers: {
      'Cache-Control': 'no-cache'
    }
  },
  preview: {
    port: 4173,
    strictPort: false,
    headers: {
      'Cache-Control': 'public, max-age=3600'
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify("1.0.0"),
  }
});
