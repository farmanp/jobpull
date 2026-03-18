import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServerRuntime, buildRuntimeOptionsFromEnv, webDistExists } from "./runtime.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..", "..");

async function main(): Promise<void> {
  const options = buildRuntimeOptionsFromEnv(ROOT_DIR);
  const runtime = await createServerRuntime(options);
  const scheduler = runtime.startScheduler();

  if (!options.adminToken) {
    console.warn("[server] ADMIN_TOKEN is empty; admin endpoints will reject requests until you set one.");
  }

  if (!webDistExists(options.webDistDir)) {
    console.warn(`[server] web dist not found at ${options.webDistDir}; build the web app for frontend serving.`);
  }

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    const origin = `http://${req.headers.host ?? `127.0.0.1:${options.port}`}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      } else {
        headers.set(key, value);
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = Readable.toWeb(req) as unknown as ReadableStream;
      (init as RequestInit & { duplex: "half" }).duplex = "half";
    }

    const request = new Request(new URL(req.url, origin), init);

    try {
      const response = await runtime.handleRequest(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      if (response.body) {
        const arrayBuffer = await response.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
      } else {
        res.end();
      }
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });

  server.listen(options.port, "0.0.0.0", () => {
    console.log(`[server] listening on http://0.0.0.0:${options.port}`);
    console.log(`[server] sqlite db: ${options.dbPath}`);
    console.log(`[server] web dist: ${options.webDistDir}`);
    console.log(`[server] cron: ${options.cronSchedule}`);
  });

  const shutdown = async (): Promise<void> => {
    scheduler.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
