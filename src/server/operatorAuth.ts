import crypto from "node:crypto";
import { normalizePath, publicViewerApiAllowed } from "./publicOnlyMode";

export type OperatorSameSite = "lax" | "strict" | "none";

export function isOperatorAuthEnabled(env: NodeJS.ProcessEnv) {
  return Boolean(operatorPasswordFromEnv(env));
}

export function operatorPasswordFromEnv(env: NodeJS.ProcessEnv) {
  return (env.ADMIN_PASSWORD ?? env.OPERATOR_PASSWORD ?? "").trim();
}

export function parseOperatorSameSite(value: string | undefined): OperatorSameSite {
  const normalized = value?.trim().toLowerCase();
  return normalized === "strict" || normalized === "none" ? normalized : "lax";
}

export function operatorRouteRequiresAuth(input: { method: string; path: string }) {
  const method = input.method.toUpperCase();
  const path = normalizePath(input.path);

  if (!path.startsWith("/api/")) {
    return false;
  }

  if (path === "/api/operator-auth/status" && method === "GET") {
    return false;
  }

  if (path === "/api/operator-auth/login" && method === "POST") {
    return false;
  }

  if (path === "/api/operator-auth/logout" && method === "POST") {
    return false;
  }

  if (method === "GET" && (path === "/api/auth/twitch/callback" || path === "/api/auth/kick/callback")) {
    return false;
  }

  return !publicViewerApiAllowed(method, path);
}

export function operatorRouteRequiresCsrf(input: { method: string; path: string }) {
  const method = input.method.toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(method) && operatorRouteRequiresAuth(input);
}

export function createOperatorSessionToken(input: { secret: string; maxAgeMs: number; now?: number }) {
  const now = input.now ?? Date.now();
  const payload = Buffer.from(
    JSON.stringify({
      sub: "operator",
      iat: now,
      exp: now + input.maxAgeMs,
      nonce: crypto.randomBytes(12).toString("base64url")
    })
  ).toString("base64url");
  return `${payload}.${sign(payload, input.secret)}`;
}

export function createOperatorCsrfToken(sessionToken: string, secret: string) {
  return sign(`csrf:${sessionToken}`, secret);
}

export function verifyOperatorCsrfToken(input: {
  csrfToken: string | null | undefined;
  sessionToken: string | null | undefined;
  secret: string;
}) {
  if (!input.csrfToken || !input.sessionToken) {
    return false;
  }

  return safeEqual(input.csrfToken, createOperatorCsrfToken(input.sessionToken, input.secret));
}

export function verifyOperatorSessionToken(token: string | null | undefined, secret: string, now = Date.now()) {
  if (!token) {
    return false;
  }

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) {
    return false;
  }

  if (!safeEqual(signature, sign(payload, secret))) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
      exp?: unknown;
    };
    return parsed.sub === "operator" && typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}

export function operatorPasswordMatches(input: string, expected: string) {
  if (!expected) {
    return false;
  }

  return safeEqual(input, expected);
}

export function parseCookieHeader(header: string | null | undefined, name: string) {
  if (!header) {
    return null;
  }

  const prefix = `${name}=`;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aHash = crypto.createHash("sha256").update(a).digest();
  const bHash = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}
