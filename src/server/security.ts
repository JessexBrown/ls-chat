import crypto from "node:crypto";
import type { Request } from "express";

export interface RawBodyRequest extends Request {
  rawBody?: string;
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyTwitchSignature(req: RawBodyRequest) {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) {
    return { ok: true, skipped: true };
  }

  const messageId = req.header("Twitch-Eventsub-Message-Id");
  const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
  const signature = req.header("Twitch-Eventsub-Message-Signature");
  const rawBody = req.rawBody ?? "";

  if (!messageId || !timestamp || !signature) {
    return { ok: false, skipped: false };
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(`${messageId}${timestamp}${rawBody}`)
    .digest("hex");

  return {
    ok: timingSafeEqual(signature, `sha256=${digest}`),
    skipped: false
  };
}

export function verifyKickSignature(req: RawBodyRequest) {
  const publicKey = normalizePem(process.env.KICK_PUBLIC_KEY_PEM);
  if (!publicKey) {
    return { ok: true, skipped: true };
  }

  const messageId = req.header("Kick-Event-Message-Id");
  const timestamp = req.header("Kick-Event-Message-Timestamp");
  const signature = req.header("Kick-Event-Signature");
  const rawBody = req.rawBody ?? "";

  if (!messageId || !timestamp || !signature) {
    return { ok: false, skipped: false };
  }

  const signedPayload = `${messageId}.${timestamp}.${rawBody}`;
  try {
    const ok = crypto.verify(
      "RSA-SHA256",
      Buffer.from(signedPayload),
      publicKey,
      Buffer.from(signature, "base64")
    );

    return { ok, skipped: false };
  } catch (error) {
    return { ok: false, skipped: false, error: String(error) };
  }
}

function normalizePem(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  let normalized = value.trim();
  if (
    (normalized.startsWith("\"") && normalized.endsWith("\"")) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!normalized.includes("-----BEGIN")) {
    const compact = normalized.replace(/\s+/g, "");
    if (/^[A-Za-z0-9+/=]+$/.test(compact)) {
      const lines = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
      normalized = `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
    }
  }

  return normalized;
}
