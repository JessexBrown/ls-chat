import { chatMessageSchema, makeMessageId, textFragment, type ChatMessage, type Platform } from "../shared/chat";

const samples: Array<{
  platform: Platform;
  sourceKind: ChatMessage["sourceKind"];
  username: string;
  displayName: string;
  channelName: string;
  message: string;
  color: string | null;
  badges: ChatMessage["badges"];
}> = [
  {
    platform: "twitch",
    sourceKind: "chat",
    username: "pixelpilot",
    displayName: "PixelPilot",
    channelName: "TwitchDev",
    message: "Audio is clean and the new overlay looks sharp.",
    color: "#a78bfa",
    badges: [{ label: "subscriber", type: "12", count: 12 }]
  },
  {
    platform: "kick",
    sourceKind: "chat",
    username: "greenroom",
    displayName: "greenroom",
    channelName: "Kick Arena",
    message: "Kick chat is moving fast today.",
    color: "#53fc18",
    badges: [{ label: "Moderator", type: "moderator", count: null }]
  },
  {
    platform: "x",
    sourceKind: "public_post",
    username: "streamwatcher",
    displayName: "Stream Watcher",
    channelName: "#LaunchStream",
    message: "Following the live stream thread from X. The Q&A is getting interesting.",
    color: null,
    badges: []
  },
  {
    platform: "twitch",
    sourceKind: "chat",
    username: "frameperfect",
    displayName: "FramePerfect",
    channelName: "TwitchDev",
    message: "Can we get a replay of that last segment?",
    color: "#38bdf8",
    badges: []
  },
  {
    platform: "kick",
    sourceKind: "chat",
    username: "latejoiner",
    displayName: "latejoiner",
    channelName: "Kick Arena",
    message: "Just got here. What did I miss?",
    color: "#facc15",
    badges: []
  }
];

let cursor = 0;

export function createDemoMessage(): ChatMessage {
  const sample = samples[cursor % samples.length];
  cursor += 1;

  const platformMessageId = `demo-${Date.now()}-${cursor}`;

  return chatMessageSchema.parse({
    id: makeMessageId(sample.platform, platformMessageId),
    platform: sample.platform,
    sourceKind: sample.sourceKind,
    platformMessageId,
    platformUserId: `demo-user-${sample.username}`,
    username: sample.username,
    displayName: sample.displayName,
    channelId: `demo-channel-${sample.channelName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    channelName: sample.channelName,
    message: sample.message,
    fragments: [textFragment(sample.message)],
    badges: sample.badges,
    avatarUrl: null,
    color: sample.color,
    sentAt: new Date().toISOString(),
    receivedAt: new Date().toISOString()
  });
}
