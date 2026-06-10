import type { LiveSession } from "./liveSession";
import { buildStreamEmbedUrl } from "./streamEmbeds";
import { streamSourceSchema, type StreamSource, type ViewerSnapshot, type ViewerSource } from "../shared/chat";

type PublicDashboardOptions = {
  session: LiveSession;
  sources: ViewerSnapshot;
  parentHost: string;
  protocol: string;
};

export function buildPublicDashboardConfig(options: PublicDashboardOptions) {
  const publicUrl = `${options.protocol}://${options.parentHost}/live`;
  const streamEmbedUrl = buildStreamEmbedUrl({
    streamEmbedUrl: options.session.streamEmbedUrl,
    streamWatchUrl: options.session.streamWatchUrl,
    parentHost: options.parentHost
  });

  return {
    ...options.session,
    streamEmbedUrl,
    streamSources: buildStreamSources({
      session: options.session,
      sources: options.sources.sources,
      parentHost: options.parentHost
    }),
    publicUrl
  };
}

export function buildStreamSources(options: {
  session: LiveSession;
  sources: ViewerSource[];
  parentHost: string;
}): StreamSource[] {
  const seen = new Set<string>();
  const streamSources: StreamSource[] = [];
  const primaryWatchUrl = options.session.streamWatchUrl ?? options.session.streamEmbedUrl;
  const primaryEmbedUrl = buildStreamEmbedUrl({
    streamEmbedUrl: options.session.streamEmbedUrl,
    streamWatchUrl: options.session.streamWatchUrl,
    parentHost: options.parentHost
  });

  addStreamSource(streamSources, seen, {
    id: "session:primary",
    platform: null,
    label: "Primary Feed",
    embedUrl: primaryEmbedUrl,
    watchUrl: primaryWatchUrl,
    viewerCount: null,
    status: primaryEmbedUrl || primaryWatchUrl ? "connected" : "unknown",
    detail: options.session.description || null,
    isPrimary: true
  });

  for (const source of options.sources) {
    if (!source.sourceUrl || source.platform === "marketbubble" || isDevelopmentSource(source)) {
      continue;
    }

    addStreamSource(streamSources, seen, {
      id: `source:${source.id}`,
      platform: source.platform,
      label: source.label,
      embedUrl: buildStreamEmbedUrl({
        streamEmbedUrl: null,
        streamWatchUrl: source.sourceUrl,
        parentHost: options.parentHost
      }),
      watchUrl: source.sourceUrl,
      viewerCount: source.viewerCount,
      status: source.status,
      detail: source.detail,
      isPrimary: false
    });
  }

  return streamSources;
}

function addStreamSource(streamSources: StreamSource[], seen: Set<string>, value: StreamSource) {
  if (!value.embedUrl && !value.watchUrl) {
    return;
  }

  const key = streamSourceKey(value);
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  streamSources.push(streamSourceSchema.parse(value));
}

function streamSourceKey(source: StreamSource) {
  return (source.watchUrl ?? source.embedUrl ?? source.id).trim().toLowerCase().replace(/\/$/, "");
}

function isDevelopmentSource(source: ViewerSource) {
  return (
    source.channelId === "local-dev-channel" ||
    source.id.startsWith("local-dev:") ||
    source.label.trim().toLowerCase() === "local development"
  );
}
