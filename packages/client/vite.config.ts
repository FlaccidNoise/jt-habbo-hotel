import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,                 // listen on all interfaces (LAN + Tailscale), not just localhost
    allowedHosts: [".ts.net"],  // permit Tailscale MagicDNS hostnames; IPs are allowed by default
    proxy: {
      "/api": "http://localhost:8080",
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
});
