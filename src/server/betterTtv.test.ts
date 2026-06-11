import { describe, expect, it } from "vitest";
import { BetterTtvService } from "./betterTtv";

describe("BetterTtvService", () => {
  it("fetches and caches global emotes", async () => {
    let calls = 0;
    const service = new BetterTtvService({
      ttlMs: 1000,
      now: () => 100,
      fetchImpl: async () => {
        calls += 1;
        return Response.json([{ id: "abc123", code: "monkaS" }]);
      }
    });

    await expect(service.globalEmotes()).resolves.toMatchObject({
      cache: "miss",
      emotes: {
        monkaS: "https://cdn.betterttv.net/emote/abc123/1x"
      }
    });
    await expect(service.globalEmotes()).resolves.toMatchObject({
      cache: "hit",
      emotes: {
        monkaS: "https://cdn.betterttv.net/emote/abc123/1x"
      }
    });
    expect(calls).toBe(1);
  });

  it("returns empty emotes for Twitch channels BetterTTV does not know", async () => {
    const service = new BetterTtvService({
      fetchImpl: async () => new Response("Not found", { status: 404 })
    });

    await expect(service.twitchChannelEmotes("123")).resolves.toMatchObject({
      cache: "miss",
      emotes: {}
    });
  });

  it("uses stale cached emotes when refresh fails", async () => {
    let now = 100;
    let fail = false;
    const service = new BetterTtvService({
      ttlMs: 10,
      now: () => now,
      fetchImpl: async () => {
        if (fail) {
          throw new Error("network down");
        }
        return Response.json([{ id: "fresh", code: "OMEGALUL" }]);
      }
    });

    await expect(service.globalEmotes()).resolves.toMatchObject({ cache: "miss" });
    now = 200;
    fail = true;

    await expect(service.globalEmotes()).resolves.toMatchObject({
      cache: "stale",
      emotes: {
        OMEGALUL: "https://cdn.betterttv.net/emote/fresh/1x"
      }
    });
  });
});
