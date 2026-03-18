import normalizeUrl from "normalize-url";

export function canonicalizeUrl(input: string): string {
  try {
    return normalizeUrl(input, {
      stripHash: true,
      removeTrailingSlash: true,
      removeQueryParameters: [/^utm_\w+/i, "ref", "source", "gh_src", "gh_jid", "lever-source", "fbclid", "gclid"]
    });
  } catch {
    return input.trim();
  }
}

export function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildJobId(company: string, title: string, location: string, url: string): Promise<string> {
  const key = [
    normalizeKeyPart(company),
    normalizeKeyPart(title),
    normalizeKeyPart(location),
    canonicalizeUrl(url)
  ].join("|");

  return sha256(key);
}
