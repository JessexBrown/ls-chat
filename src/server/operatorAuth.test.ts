import { describe, expect, it } from "vitest";
import {
  createOperatorSessionToken,
  createOperatorCsrfToken,
  isOperatorAuthEnabled,
  operatorPasswordMatches,
  operatorRouteRequiresAuth,
  operatorRouteRequiresCsrf,
  parseCookieHeader,
  parseOperatorSameSite,
  verifyOperatorCsrfToken,
  verifyOperatorSessionToken
} from "./operatorAuth";

describe("operator auth", () => {
  it("is enabled only when an operator password is configured", () => {
    expect(isOperatorAuthEnabled({})).toBe(false);
    expect(isOperatorAuthEnabled({ ADMIN_PASSWORD: "  " })).toBe(false);
    expect(isOperatorAuthEnabled({ ADMIN_PASSWORD: "secret" })).toBe(true);
    expect(isOperatorAuthEnabled({ OPERATOR_PASSWORD: "secret" })).toBe(true);
  });

  it("protects admin APIs while keeping public viewer APIs open", () => {
    expect(operatorRouteRequiresAuth({ method: "GET", path: "/" })).toBe(false);
    expect(operatorRouteRequiresAuth({ method: "GET", path: "/api/operator-auth/status" })).toBe(false);
    expect(operatorRouteRequiresAuth({ method: "POST", path: "/api/operator-auth/login" })).toBe(false);
    expect(operatorRouteRequiresAuth({ method: "GET", path: "/api/public/config" })).toBe(false);
    expect(operatorRouteRequiresAuth({ method: "GET", path: "/api/messages" })).toBe(false);
    expect(operatorRouteRequiresAuth({ method: "POST", path: "/api/native-chat/messages" })).toBe(false);
    expect(operatorRouteRequiresAuth({ method: "POST", path: "/api/webhooks/kick" })).toBe(false);
    expect(operatorRouteRequiresAuth({ method: "GET", path: "/api/auth/twitch/callback" })).toBe(false);

    expect(operatorRouteRequiresAuth({ method: "GET", path: "/api/health" })).toBe(true);
    expect(operatorRouteRequiresAuth({ method: "PUT", path: "/api/live-session" })).toBe(true);
    expect(operatorRouteRequiresAuth({ method: "DELETE", path: "/api/native-chat/messages/marketbubble:native-1" })).toBe(true);
    expect(operatorRouteRequiresAuth({ method: "POST", path: "/api/native-chat/users/marketbubble:guest_123/mute" })).toBe(true);
    expect(operatorRouteRequiresAuth({ method: "GET", path: "/api/auth/twitch/start" })).toBe(true);
    expect(operatorRouteRequiresAuth({ method: "POST", path: "/api/mock/messages" })).toBe(true);
  });

  it("requires CSRF only for authenticated admin mutations", () => {
    expect(operatorRouteRequiresCsrf({ method: "GET", path: "/api/health" })).toBe(false);
    expect(operatorRouteRequiresCsrf({ method: "POST", path: "/api/integrations/twitch/restart" })).toBe(true);
    expect(operatorRouteRequiresCsrf({ method: "PUT", path: "/api/live-session" })).toBe(true);
    expect(operatorRouteRequiresCsrf({ method: "DELETE", path: "/api/integrations/twitch/targets/example" })).toBe(true);
    expect(operatorRouteRequiresCsrf({ method: "DELETE", path: "/api/native-chat/messages/marketbubble:native-1" })).toBe(true);
    expect(operatorRouteRequiresCsrf({ method: "POST", path: "/api/native-chat/users/marketbubble:guest_123/mute" })).toBe(true);
    expect(operatorRouteRequiresCsrf({ method: "POST", path: "/api/native-chat/messages" })).toBe(false);
    expect(operatorRouteRequiresCsrf({ method: "POST", path: "/api/webhooks/kick" })).toBe(false);
    expect(operatorRouteRequiresCsrf({ method: "POST", path: "/api/operator-auth/login" })).toBe(false);
  });

  it("signs and verifies expiring operator session tokens", () => {
    const token = createOperatorSessionToken({ secret: "test-secret", maxAgeMs: 1000, now: 100 });

    expect(verifyOperatorSessionToken(token, "test-secret", 500)).toBe(true);
    expect(verifyOperatorSessionToken(token, "wrong-secret", 500)).toBe(false);
    expect(verifyOperatorSessionToken(`${token}tampered`, "test-secret", 500)).toBe(false);
    expect(verifyOperatorSessionToken(token, "test-secret", 1200)).toBe(false);
  });

  it("creates CSRF tokens bound to the operator session", () => {
    const sessionToken = createOperatorSessionToken({ secret: "test-secret", maxAgeMs: 1000, now: 100 });
    const csrfToken = createOperatorCsrfToken(sessionToken, "test-secret");

    expect(verifyOperatorCsrfToken({ csrfToken, sessionToken, secret: "test-secret" })).toBe(true);
    expect(verifyOperatorCsrfToken({ csrfToken: "bad", sessionToken, secret: "test-secret" })).toBe(false);
    expect(verifyOperatorCsrfToken({ csrfToken, sessionToken: `${sessionToken}bad`, secret: "test-secret" })).toBe(false);
    expect(verifyOperatorCsrfToken({ csrfToken, sessionToken, secret: "wrong-secret" })).toBe(false);
  });

  it("matches operator passwords without exposing plain string comparison behavior", () => {
    expect(operatorPasswordMatches("secret", "secret")).toBe(true);
    expect(operatorPasswordMatches("nope", "secret")).toBe(false);
    expect(operatorPasswordMatches("secret", "")).toBe(false);
  });

  it("parses cookie and SameSite values", () => {
    expect(parseCookieHeader("other=1; mb_operator_session=abc.def", "mb_operator_session")).toBe("abc.def");
    expect(parseCookieHeader(undefined, "mb_operator_session")).toBeNull();
    expect(parseOperatorSameSite("none")).toBe("none");
    expect(parseOperatorSameSite("strict")).toBe("strict");
    expect(parseOperatorSameSite("unexpected")).toBe("lax");
  });
});
