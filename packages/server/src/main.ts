import { startServer } from "./server.ts";

await startServer({
  port: Number(process.env.PORT ?? 8080),
  // The hotel answers on every interface, v6 and v4 both — "::" is what listen() with no host
  // used to pick, and http://localhost:8080 resolves to ::1 first. startServer defaults to the
  // loopback so a test server can never share a port with another local process (#400), so the
  // real one has to say so.
  host: "::",
  dbPath: process.env.DB_PATH ?? new URL("../grand.db", import.meta.url).pathname,
  staticDir: process.env.STATIC_DIR,
  // Browser Origin allowlist for the WS upgrade. TLS terminates at the proxy in front of this
  // process (tailscale funnel today); this app binds plaintext and must never be exposed bare.
  // Comma-separated, e.g. GRAND_ALLOWED_ORIGINS="https://joshtaylor.world". Unset = local dev,
  // every Origin passes.
  allowedOrigins: process.env.GRAND_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
});
