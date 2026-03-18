import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function contentTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function readAsset(assetPath: string): Promise<Uint8Array | null> {
  try {
    return await readFile(assetPath);
  } catch {
    return null;
  }
}

export function createStaticHandler(webDistDir: string): (request: Request) => Promise<Response> {
  const root = resolve(webDistDir);
  const indexPath = join(root, "index.html");

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const assetPath = resolve(root, `.${pathname}`);

    if (!assetPath.startsWith(root)) {
      return new Response("Forbidden", { status: 403 });
    }

    const directAsset = pathname === "/" ? indexPath : assetPath;
    const directBytes = await readAsset(directAsset);
    const fallbackBytes = directBytes ?? (pathname === "/" ? null : await readAsset(indexPath));

    if (!fallbackBytes) {
      return new Response("Web assets are not built yet. Run npm run build -w web.", { status: 503 });
    }

    const responsePath = directBytes ? directAsset : indexPath;
    return new Response(new Blob([Buffer.from(fallbackBytes)]), {
      headers: {
        "content-type": contentTypeFor(responsePath),
        "cache-control": responsePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
      }
    });
  };
}
