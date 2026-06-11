import { describe, expect, it } from "vitest";
import { normalizeMarketBubbleBranding } from "./liveSession";

describe("live session branding", () => {
  it("normalizes the older joined Market Bubble label", () => {
    expect(normalizeMarketBubbleBranding("MarketBubble Live")).toBe("Market Bubble Live");
    expect(normalizeMarketBubbleBranding("MarketBubble")).toBe("Market Bubble");
  });
});
