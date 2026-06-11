import { describe, expect, it } from "vitest";
import { frameAncestorsDirective, parseEmbedAllowedOrigins, securityHeaderSnapshot } from "./embedPolicy";

describe("embed policy", () => {
  it("parses configured embed origins and removes duplicates", () => {
    expect(
      parseEmbedAllowedOrigins("self, 'self', https://marketbubble.com, https://marketbubble.com, https://partner.example")
    ).toEqual(["https://marketbubble.com", "https://partner.example"]);
  });

  it("builds a frame-ancestors directive with self plus configured origins", () => {
    expect(frameAncestorsDirective(["https://marketbubble.com", "https://www.marketbubble.com"])).toBe(
      "frame-ancestors 'self' https://marketbubble.com https://www.marketbubble.com"
    );
  });

  it("exposes a non-secret snapshot for health/readiness UI", () => {
    expect(securityHeaderSnapshot(["https://marketbubble.com"])).toEqual({
      embedAllowedOrigins: ["https://marketbubble.com"],
      frameAncestors: "frame-ancestors 'self' https://marketbubble.com"
    });
  });
});
