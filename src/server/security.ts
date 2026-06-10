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
  const publicKey = process.env.KICK_PUBLIC_KEY_PEM;
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
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signedPayload),
    publicKey,
    Buffer.from(signature, "base64")
  );

  return { ok, skipped: false };
}
