import { describe, expect, it } from "vitest";
import { normalizeKickChatMessage } from "./kick";
import { normalizeTwitchChatMessage } from "./twitch";
import { normalizeXFilteredStreamPost, normalizeXLiveCaptureMessage } from "./x";

describe("platform adapters", () => {
  it("normalizes Twitch chat messages", () => {
    const message = normalizeTwitchChatMessage({
      subscription: { type: "channel.chat.message" },
      event: {
        broadcaster_user_id: "12826",
        broadcaster_user_login: "twitch",
        broadcaster_user_name: "Twitch",
        chatter_user_id: "141981764",
        chatter_user_login: "twitchdev",
        chatter_user_name: "TwitchDev",
        message_id: "cc106a89",
        message: { text: "Hi chat", fragments: [{ type: "text", text: "Hi chat" }] },
        color: "#00FF7F",
        badges: [{ set_id: "moderator", id: "1", info: "" }]
      }
    });

    expect(message?.platform).toBe("twitch");
    expect(message?.message).toBe("Hi chat");
    expect(message?.username).toBe("twitchdev");
  });

  it("normalizes Kick chat messages", () => {
    const message = normalizeKickChatMessage({
      message_id: "unique_message_id_123",
      broadcaster: { user_id: 123456789, username: "broadcaster_name" },
      sender: {
        user_id: 987654321,
        username: "sender_name",
        identity: {
          username_color: "#FF5733",
          badges: [{ text: "Moderator", type: "moderator" }]
        }
      },
      content: "Hello Kick",
      created_at: "2025-01-14T16:08:06Z"
    });

    expect(message.platform).toBe("kick");
    expect(message.message).toBe("Hello Kick");
    expect(message.badges[0]?.label).toBe("Moderator");
  });

  it("normalizes X filtered stream posts as public posts", () => {
    const message = normalizeXFilteredStreamPost({
      data: {
        id: "1346889436626259968",
        text: "Live thread update",
        author_id: "2244994945",
        created_at: "2026-06-05T16:08:06Z"
      },
      includes: {
        users: [{ id: "2244994945", username: "XDevelopers", name: "X Developers" }]
      },
      matching_rules: [{ id: "rule-1", tag: "#LaunchStream" }]
    });

    expect(message.platform).toBe("x");
    expect(message.sourceKind).toBe("public_post");
    expect(message.channelName).toBe("#LaunchStream");
  });

  it("normalizes browser-captured X live chat messages", () => {
    const message = normalizeXLiveCaptureMessage({
      platformMessageId: "browser:abc123",
      username: "liveviewer",
      displayName: "Live Viewer",
      message: "This came from the X broadcast chat",
      channelName: "X Live Broadcast",
      sourceUrl: "https://x.com/i/broadcasts/example",
      capturedAt: "2026-06-09T16:08:06Z"
    });

    expect(message.platform).toBe("x");
    expect(message.sourceKind).toBe("chat");
    expect(message.username).toBe("liveviewer");
    expect(message.channelName).toBe("X Live Broadcast");
    expect(message.badges[0]?.type).toBe("browser-capture");
  });
});
