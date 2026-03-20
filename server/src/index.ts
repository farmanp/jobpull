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
  const currentSchedule = runtime.env.getRuntimeSchedule ? await runtime.env.getRuntimeSchedule() : options.cronSchedule;

  if (!options.adminToken) {
    console.warn("[server] ADMIN_TOKEN is empty; admin endpoints will reject requests until you set one.");
  }

  if (!options.sessionSecret) {
    console.warn("[server] SESSION_SECRET is empty; owner sessions and auth routes will not work until you set one.");
  }

  if (!webDistExists(options.webDistDir)) {
    console.warn(`[server] web dist not found at ${options.webDistDir}; build the web app for frontend serving.`);
  }

  function applyCorsHeaders(request: Request, response: Response): Response {
    const origin = request.headers.get("origin");
    if (!origin) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-headers", "content-type, authorization");
    headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("vary", "Origin");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  function preflightResponse(request: Request): Response {
    const origin = request.headers.get("origin");
    const headers = new Headers();
    if (origin) {
      headers.set("access-control-allow-origin", origin);
      headers.set("access-control-allow-credentials", "true");
      headers.set("access-control-allow-headers", "content-type, authorization");
      headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
      headers.set("vary", "Origin");
    }

    return new Response(null, { status: 204, headers });
  }

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    if (req.method === "OPTIONS") {
      const requestHeaders = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) {
          continue;
        }

        if (Array.isArray(value)) {
          requestHeaders.set(key, value.join(", "));
        } else {
          requestHeaders.set(key, value);
        }
      }
      const response = preflightResponse(new Request(req.url, { method: req.method, headers: requestHeaders }));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end();
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
      const response = applyCorsHeaders(request, await runtime.handleRequest(request));
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
    console.log(`[server] cron: ${currentSchedule}`);
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
