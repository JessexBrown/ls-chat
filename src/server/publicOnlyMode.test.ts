import { describe, expect, it } from "vitest";
import { isPublicOnlyMode, publicOnlyRouteAction } from "./publicOnlyMode";

describe("public-only mode", () => {
  it("can be enabled with supported env flags", () => {
    expect(isPublicOnlyMode({ PUBLIC_LIVE_ONLY: "true" })).toBe(true);
    expect(isPublicOnlyMode({ MARKETBUBBLE_PUBLIC_ONLY: "true" })).toBe(true);
    expect(isPublicOnlyMode({ APP_MODE: "public" })).toBe(true);
    expect(isPublicOnlyMode({})).toBe(false);
  });

  it("redirects HTML app routes away from the admin dashboard", () => {
    expect(publicOnlyRouteAction({ method: "GET", path: "/", accept: "text/html" })).toBe("redirect");
    expect(publicOnlyRouteAction({ method: "GET", path: "/admin", accept: "text/html" })).toBe("redirect");
    expect(publicOnlyRouteAction({ method: "GET", path: "/live", accept: "text/html" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/embed", accept: "text/html" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/embed?view=chat", accept: "text/html" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/mock-marketbubble", accept: "text/html" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/src/client/main.tsx", accept: "*/*" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/assets/index.js", accept: "*/*" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/x-live-capture.js" })).toBe("allow");
  });

  it("allows public viewer and ingestion APIs", () => {
    expect(publicOnlyRouteAction({ method: "GET", path: "/api/public/config" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/api/messages" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/api/native-chat/session" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "POST", path: "/api/native-chat/messages" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "GET", path: "/api/emotes/betterttv/global" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "POST", path: "/api/webhooks/kick" })).toBe("allow");
    expect(publicOnlyRouteAction({ method: "POST", path: "/api/capture/x-live" })).toBe("allow");
  });

  it("blocks admin settings, OAuth, and mock APIs", () => {
    expect(publicOnlyRouteAction({ method: "GET", path: "/api/health" })).toBe("block");
    expect(publicOnlyRouteAction({ method: "PUT", path: "/api/live-session" })).toBe("block");
    expect(publicOnlyRouteAction({ method: "POST", path: "/api/integrations/twitch/restart" })).toBe("block");
    expect(publicOnlyRouteAction({ method: "GET", path: "/api/auth/twitch/start" })).toBe("block");
    expect(publicOnlyRouteAction({ method: "POST", path: "/api/mock/messages" })).toBe("block");
  });
});
