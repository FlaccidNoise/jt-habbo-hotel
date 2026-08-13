import { startServer } from "./server.ts";

await startServer({
  port: Number(process.env.PORT ?? 8080),
  // Loopback by default: TLS terminates at the proxy in front (tailscale funnel), and a public
  // bind would serve logins in cleartext. Set HOST="::" only for a LAN/tailnet dev server.
  host: process.env.HOST ?? "127.0.0.1",
  dbPath: process.env.DB_PATH ?? new URL("../grand.db", import.meta.url).pathname,
  staticDir: process.env.STATIC_DIR,
  // Browser Origin allowlist for the WS upgrade. TLS terminates at the proxy in front of this
  // process (tailscale funnel today); this app binds plaintext and must never be exposed bare.
  // Comma-separated, e.g. GRAND_ALLOWED_ORIGINS="https://joshtaylor.world". Unset = local dev,
  // every Origin passes.
  allowedOrigins: process.env.GRAND_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
});
