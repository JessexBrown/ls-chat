import crypto from "node:crypto";

export type NativeGuestSession = {
  version: 1;
  id: string;
  displayName: string;
  issuedAt: string;
  lastSeenAt: string;
};

export type NativeGuestIdentity = {
  kind: "guest";
  clientId: string;
  displayName: string;
  issuedAt: string;
  lastSeenAt: string;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createNativeGuestSession(now = new Date()): NativeGuestSession {
  const random = crypto.randomBytes(9).toString("base64url");
  const compact = random.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "LOCAL";
  const timestamp = now.toISOString();

  return {
    version: 1,
    id: `guest_${random}`,
    displayName: `Guest ${compact}`,
    issuedAt: timestamp,
    lastSeenAt: timestamp
  };
}

export function touchNativeGuestSession(session: NativeGuestSession, now = new Date()): NativeGuestSession {
  return {
    ...session,
    lastSeenAt: now.toISOString()
  };
}

export function nativeGuestIdentity(session: NativeGuestSession): NativeGuestIdentity {
  return {
    kind: "guest",
    clientId: session.id,
    displayName: session.displayName,
    issuedAt: session.issuedAt,
    lastSeenAt: session.lastSeenAt
  };
}

export function encodeNativeGuestSession(session: NativeGuestSession, secret: string) {
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${signPayload(payload, secret)}`;
}

export function decodeNativeGuestSession(value: string | undefined, secret: string) {
  if (!value) {
    return null;
  }

  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length > 0 || !timingSafeEqual(signature, signPayload(payload, secret))) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<NativeGuestSession>;
    if (
      parsed.version !== 1 ||
      typeof parsed.id !== "string" ||
      !/^guest_[A-Za-z0-9_-]{8,80}$/.test(parsed.id) ||
      typeof parsed.displayName !== "string" ||
      !parsed.displayName.startsWith("Guest ") ||
      typeof parsed.issuedAt !== "string" ||
      typeof parsed.lastSeenAt !== "string"
    ) {
      return null;
    }

    return {
      version: 1,
      id: parsed.id,
      displayName: parsed.displayName.slice(0, 32),
      issuedAt: parsed.issuedAt,
      lastSeenAt: parsed.lastSeenAt
    } satisfies NativeGuestSession;
  } catch {
    return null;
  }
}

export function parseCookieHeader(header: string | undefined, name: string) {
  if (!header) {
    return undefined;
  }

  return header
    .split(";")
    .map((piece) => piece.trim())
    .map((piece) => {
      const separator = piece.indexOf("=");
      return separator === -1 ? [piece, ""] : [piece.slice(0, separator), piece.slice(separator + 1)];
    })
    .find(([key]) => key === name)?.[1];
}
