import { startServer } from "./server.ts";

await startServer({
  port: Number(process.env.PORT ?? 8080),
  // The hotel answers on every interface. startServer defaults to the loopback so that a test
  // server can never share a port with another local process (#400) — the real one opts out.
  host: "0.0.0.0",
  dbPath: process.env.DB_PATH ?? new URL("../grand.db", import.meta.url).pathname,
  staticDir: process.env.STATIC_DIR,
});
