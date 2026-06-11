import { describe, expect, it } from "vitest";
import {
  createNativeGuestSession,
  decodeNativeGuestSession,
  encodeNativeGuestSession,
  nativeGuestIdentity,
  parseCookieHeader,
  touchNativeGuestSession
} from "./nativeSession";

describe("native guest sessions", () => {
  it("round-trips signed guest sessions", () => {
    const session = createNativeGuestSession(new Date("2026-06-10T16:00:00.000Z"));
    const encoded = encodeNativeGuestSession(session, "test-secret");
    const decoded = decodeNativeGuestSession(encoded, "test-secret");

    expect(decoded).toEqual(session);
    expect(nativeGuestIdentity(session)).toMatchObject({
      kind: "guest",
      clientId: session.id,
      displayName: session.displayName
    });
  });

  it("rejects tampered or incorrectly signed sessions", () => {
    const session = createNativeGuestSession();
    const encoded = encodeNativeGuestSession(session, "test-secret");

    expect(decodeNativeGuestSession(`${encoded}tampered`, "test-secret")).toBeNull();
    expect(decodeNativeGuestSession(encoded, "wrong-secret")).toBeNull();
  });

  it("touches last seen without changing identity", () => {
    const session = createNativeGuestSession(new Date("2026-06-10T16:00:00.000Z"));
    const touched = touchNativeGuestSession(session, new Date("2026-06-10T16:05:00.000Z"));

    expect(touched.id).toBe(session.id);
    expect(touched.displayName).toBe(session.displayName);
    expect(touched.lastSeenAt).toBe("2026-06-10T16:05:00.000Z");
  });

  it("parses named cookie values", () => {
    expect(parseCookieHeader("theme=dark; mb_native_guest=abc.def; other=1", "mb_native_guest")).toBe("abc.def");
  });
});
