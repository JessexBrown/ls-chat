type StreamEmbedOptions = {
  streamEmbedUrl?: string | null;
  streamWatchUrl?: string | null;
  parentHost: string;
};

const twitchReservedPaths = new Set([
  "directory",
  "downloads",
  "friends",
  "inventory",
  "jobs",
  "login",
  "p",
  "settings",
  "subscriptions",
  "turbo",
  "wallet"
]);

export function buildStreamEmbedUrl(options: StreamEmbedOptions) {
  const parentHost = normalizeParentHost(options.parentHost);
  const explicitEmbed = normalizeEmbeddableUrl(options.streamEmbedUrl, parentHost, true);
  if (explicitEmbed) {
    return explicitEmbed;
  }

  return normalizeEmbeddableUrl(options.streamWatchUrl, parentHost, false);
}

export function normalizeParentHost(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "localhost";
  }

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.split(":")[0] || "localhost";
  }
}

function normalizeEmbeddableUrl(value: string | null | undefined, parentHost: string, allowUnknown: boolean) {
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const twitchUrl = normalizeTwitchEmbedUrl(url, parentHost);
  if (twitchUrl) {
    return twitchUrl;
  }

  const kickUrl = normalizeKickEmbedUrl(url);
  if (kickUrl) {
    return kickUrl;
  }

  const youtubeUrl = normalizeYouTubeEmbedUrl(url);
  if (youtubeUrl) {
    return youtubeUrl;
  }

  return allowUnknown ? url.toString() : null;
}

function normalizeTwitchEmbedUrl(url: URL, parentHost: string) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (hostname === "player.twitch.tv") {
    const next = new URL(url.toString());
    if (!next.searchParams.has("parent")) {
      next.searchParams.append("parent", parentHost);
    }
    return next.toString();
  }

  if (hostname !== "twitch.tv" && hostname !== "m.twitch.tv") {
    return null;
  }

  const firstPath = pathParts[0]?.toLowerCase();
  if (!firstPath || twitchReservedPaths.has(firstPath)) {
    return null;
  }

  const next = new URL("https://player.twitch.tv/");
  if (firstPath === "videos" && pathParts[1]) {
    next.searchParams.set("video", pathParts[1].startsWith("v") ? pathParts[1] : `v${pathParts[1]}`);
  } else {
    next.searchParams.set("channel", pathParts[0]);
  }
  next.searchParams.set("parent", parentHost);
  next.searchParams.set("autoplay", "false");
  return next.toString();
}

function normalizeKickEmbedUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (hostname === "player.kick.com") {
    return url.toString();
  }

  if (hostname !== "kick.com" || !pathParts[0]) {
    return null;
  }

  return `https://player.kick.com/${encodeURIComponent(pathParts[0])}`;
}

function normalizeYouTubeEmbedUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  if (hostname === "youtube.com" && url.pathname.startsWith("/embed/")) {
    return url.toString();
  }

  if (hostname === "youtube.com" && url.pathname === "/watch") {
    const videoId = url.searchParams.get("v");
    return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : null;
  }

  if (hostname === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : null;
  }

  return null;
}
