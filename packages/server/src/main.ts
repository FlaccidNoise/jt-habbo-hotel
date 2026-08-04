import { startServer } from "./server.ts";

await startServer({
  port: Number(process.env.PORT ?? 8080),
  dbPath: process.env.DB_PATH ?? new URL("../grand.db", import.meta.url).pathname,
  staticDir: process.env.STATIC_DIR,
});
