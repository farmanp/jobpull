import type { Env } from "./types";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailDeliveryResult = {
  providerMessageId: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function resolvePublicBaseUrl(env: Env, requestUrl?: string): string | null {
  const base = env.PUBLIC_BASE_URL?.trim() || (requestUrl ? new URL(requestUrl).origin : "");
  const trimmed = base.replace(/\/+$/, "");
  return trimmed || null;
}

export function buildPublicUrl(baseUrl: string, path: string, token: string): string {
  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function sendResendEmail(
  env: Env,
  payload: EmailPayload,
  idempotencyKey?: string
): Promise<EmailDeliveryResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Email delivery is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      reply_to: env.EMAIL_REPLY_TO ? env.EMAIL_REPLY_TO : undefined,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text
    })
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payloadJson = contentType.includes("application/json")
    ? await response.json() as { id?: string; message?: string; error?: { message?: string } | string }
    : null;

  if (!response.ok) {
    const errorMessage =
      (typeof payloadJson?.error === "string" ? payloadJson.error : payloadJson?.error?.message) ||
      payloadJson?.message ||
      `Email delivery failed: ${response.status}`;
    throw new Error(errorMessage);
  }

  return {
    providerMessageId: payloadJson?.id ?? null
  };
}
