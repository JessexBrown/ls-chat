import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyKickSignature, type RawBodyRequest } from "./security";

function kickRequest(input: {
  publicKeyPem: string;
  privateKeyPem: string;
  body: string;
  messageId?: string;
  timestamp?: string;
}) {
  const messageId = input.messageId ?? "message-1";
  const timestamp = input.timestamp ?? "2026-06-11T19:00:00Z";
  process.env.KICK_PUBLIC_KEY_PEM = input.publicKeyPem;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(`${messageId}.${timestamp}.${input.body}`), input.privateKeyPem)
    .toString("base64");

  return {
    rawBody: input.body,
    header(name: string) {
      const headers: Record<string, string> = {
        "Kick-Event-Message-Id": messageId,
        "Kick-Event-Message-Timestamp": timestamp,
        "Kick-Event-Signature": signature
      };
      return headers[name];
    }
  } as RawBodyRequest;
}

describe("Kick webhook signature verification", () => {
  it("accepts quoted PEM values with escaped newlines from hosted env editors", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const request = kickRequest({
      publicKeyPem: `"${publicKeyPem.replace(/\n/g, "\\n")}"`,
      privateKeyPem,
      body: "{\"message_id\":\"1\"}"
    });

    expect(verifyKickSignature(request)).toEqual({ ok: true, skipped: false });
  });

  it("reconstructs PEM headers when only the base64 body is configured", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const publicKeyBody = publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const request = kickRequest({
      publicKeyPem: publicKeyBody,
      privateKeyPem,
      body: "{\"message_id\":\"2\"}"
    });

    expect(verifyKickSignature(request)).toEqual({ ok: true, skipped: false });
  });
});
