import type { Env } from "./types";

export type SessionClaims = {
  userId: string;
  email: string;
  role: "owner";
  exp: number;
};

export const SESSION_COOKIE_NAME = "jobpull_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signBytes(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSignedSessionToken(claims: SessionClaims, secret: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await signBytes(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifySignedSessionToken(token: string, secret: string): Promise<SessionClaims | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = await signBytes(secret, payload);
  if (expected !== signature) {
    return null;
  }

  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as SessionClaims;
    if (!claims || claims.role !== "owner" || typeof claims.userId !== "string" || typeof claims.email !== "string") {
      return null;
    }

    if (!Number.isFinite(claims.exp) || claims.exp * 1000 < Date.now()) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

export function getCookieHeader(request: Request): string {
  return request.headers.get("cookie") ?? "";
}

export function parseCookieHeader(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, segment) => {
    const [rawKey, ...rawValue] = segment.trim().split("=");
    if (!rawKey) {
      return acc;
    }
    acc[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join("=") ?? "");
    return acc;
  }, {});
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(getCookieHeader(request));
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

export function buildSessionCookie(token: string, requestUrl?: string): string {
  const secure = requestUrl ? new URL(requestUrl).protocol === "https:" : true;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearSessionCookie(requestUrl?: string): string {
  const secure = requestUrl ? new URL(requestUrl).protocol === "https:" : true;
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function hasSessionSecret(env: Env): boolean {
  return Boolean(env.SESSION_SECRET?.trim());
}
