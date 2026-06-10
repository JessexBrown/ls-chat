import { describe, expect, it } from "vitest";
import { buildPublicDashboardConfig, buildStreamSources } from "./publicDashboard";
import type { LiveSession } from "./liveSession";
import type { ViewerSnapshot } from "../shared/chat";

const now = "2026-06-10T16:00:00.000Z";

const session: LiveSession = {
  id: "default",
  title: "MarketBubble Live",
  nativeChatLabel: "MarketBubble",
  streamEmbedUrl: "https://www.twitch.tv/jynxzi",
  streamWatchUrl: "https://www.twitch.tv/jynxzi",
  description: "The live desk",
  updatedAt: now
};

const sources: ViewerSnapshot = {
  totalKnownViewers: 150,
  unknownSourceCount: 0,
  updatedAt: now,
  sources: [
    {
      id: "twitch:123",
      platform: "twitch",
      label: "jynxzi",
      channelId: "123",
      channelName: "jynxzi",
      sourceUrl: "https://www.twitch.tv/jynxzi",
      viewerCount: 100,
      chattersCount: null,
      status: "live",
      detail: "Twitch stream",
      updatedAt: now
    },
    {
      id: "kick:456",
      platform: "kick",
      label: "jynxzi",
      channelId: "456",
      channelName: "jynxzi",
      sourceUrl: "https://kick.com/jynxzi",
      viewerCount: 50,
      chattersCount: null,
      status: "live",
      detail: "Kick stream",
      updatedAt: now
    },
    {
      id: "marketbubble:native-live",
      platform: "marketbubble",
      label: "MarketBubble",
      channelId: "marketbubble-native-live",
      channelName: "MarketBubble",
      sourceUrl: "https://marketbubble.com/live",
      viewerCount: 3,
      chattersCount: null,
      status: "live",
      detail: "Native dashboard viewers",
      updatedAt: now
    }
  ]
};

describe("public dashboard stream sources", () => {
  it("keeps the legacy streamEmbedUrl and adds switchable stream sources", () => {
    const config = buildPublicDashboardConfig({
      session,
      sources,
      parentHost: "localhost:4200",
      protocol: "http"
    });

    expect(config.streamEmbedUrl).toBe("https://player.twitch.tv/?channel=jynxzi&parent=localhost&autoplay=false");
    expect(config.streamSources).toHaveLength(2);
    expect(config.streamSources[0]).toMatchObject({
      id: "session:primary",
      label: "Primary Feed",
      isPrimary: true
    });
    expect(config.streamSources[1]).toMatchObject({
      id: "source:kick:456",
      platform: "kick",
      label: "jynxzi",
      embedUrl: "https://player.kick.com/jynxzi",
      viewerCount: 50
    });
  });

  it("can build stream sources from tracked channels when no primary feed is configured", () => {
    const result = buildStreamSources({
      session: { ...session, streamEmbedUrl: null, streamWatchUrl: null },
      sources: sources.sources,
      parentHost: "marketbubble.com"
    });

    expect(result.map((source) => source.label)).toEqual(["jynxzi", "jynxzi"]);
    expect(result[0].embedUrl).toBe("https://player.twitch.tv/?channel=jynxzi&parent=marketbubble.com&autoplay=false");
    expect(result[1].embedUrl).toBe("https://player.kick.com/jynxzi");
  });

  it("does not expose development mock sources as viewer stream options", () => {
    const result = buildStreamSources({
      session: { ...session, streamEmbedUrl: null, streamWatchUrl: null },
      parentHost: "marketbubble.com",
      sources: [
        ...sources.sources,
        {
          id: "local-dev:twitch",
          platform: "twitch",
          label: "Local Development",
          channelId: "local-dev-channel",
          channelName: "Local Development",
          sourceUrl: "https://www.twitch.tv/local-development",
          viewerCount: null,
          chattersCount: null,
          status: "connected",
          detail: null,
          updatedAt: now
        }
      ]
    });

    expect(result.map((source) => source.label)).toEqual(["jynxzi", "jynxzi"]);
  });
});
