import {
  ArrowDown,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  LogIn,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  UserX,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Virtuoso, type Components, type ScrollerProps, type VirtuosoHandle } from "react-virtuoso";
import { isNativeMarketBubbleMessage, type ChatMessage, type Platform, type StreamSource, type ViewerSnapshot } from "../shared/chat";
import {
  expandBetterTtvFragments,
  normalizeBetterTtvEmoteMap,
  type BetterTtvEmoteMap
} from "../shared/betterTtv";
import {
  defaultChatPreferences,
  messageStyleOptions,
  readChatPreferences,
  writeChatPreferences,
  type ChatPreferences,
  type MessageStyle
} from "./preferences";
import { useChatStream } from "./useChatStream";

const platformLabels: Record<Platform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  marketbubble: "Market Bubble"
};

const platformColors: Record<Platform, string> = {
  twitch: "#a970ff",
  kick: "#53fc18",
  x: "#e7eaee",
  marketbubble: "#e8ff9c"
};

const platformOrder: Platform[] = ["twitch", "kick", "x", "marketbubble"];
const settingsPlatformOrder: Array<Exclude<Platform, "marketbubble">> = ["twitch", "kick", "x"];

type VisualPreset = "marketbubble" | "tradefloor" | "studio";

const visualPresets: Array<{ id: VisualPreset; label: string }> = [
  { id: "marketbubble", label: "Market Bubble" },
  { id: "tradefloor", label: "Trading Floor" },
  { id: "studio", label: "Studio" }
];

const marketBubbleMockHeroImage =
  "https://framerusercontent.com/images/2gHM5kfSYEduDwGSYpdokna23M.jpg?height=1688&width=3000";

function initialVisualPreset(): VisualPreset {
  if (typeof window === "undefined") {
    return "marketbubble";
  }

  const stored = window.localStorage.getItem("ls-chat-visual-preset");
  return visualPresets.some((preset) => preset.id === stored) ? (stored as VisualPreset) : "marketbubble";
}

function initialNativeClientId() {
  if (typeof window === "undefined") {
    return "guest-server";
  }

  const existing = window.localStorage.getItem("ls-chat-native-client-id");
  if (existing) {
    return existing;
  }

  const randomId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const nextId = `guest_${randomId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48)}`;
  window.localStorage.setItem("ls-chat-native-client-id", nextId);
  return nextId;
}

function initialChatPreferences(): ChatPreferences {
  if (typeof window === "undefined") {
    return { ...defaultChatPreferences };
  }

  return readChatPreferences(window.localStorage);
}

async function fetchBetterTtvEmoteMap(path: string) {
  const response = await fetch(path);
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error("BetterTTV emote endpoint unavailable.");
  }

  const payload = (await response.json()) as { emotes?: unknown };
  return normalizeBetterTtvEmoteMap(payload.emotes);
}

function shortNativeClientId(value: string) {
  const compact = value.replace(/^guest_/, "").replace(/[^A-Za-z0-9]/g, "");
  return `Guest ${compact.slice(-6).toUpperCase() || "LOCAL"}`;
}

type ChatVirtuosoContext = {
  onScrollPositionChange: (scrollTop: number) => void;
  onUserScrollIntent: () => void;
};

const virtuosoComponents: Components<ChatMessage, ChatVirtuosoContext> = {
  Scroller: forwardRef<HTMLDivElement, ScrollerProps & { context: ChatVirtuosoContext }>(function ChatScroller(
    { context, ...props },
    ref
  ) {
    return (
      <div
        {...props}
        ref={ref}
        onScroll={(event) => {
          context.onScrollPositionChange(event.currentTarget.scrollTop);
        }}
        onWheel={(event) => {
          if (event.deltaY < -1) {
            context.onUserScrollIntent();
          }
        }}
        onTouchStart={() => {
          context.onUserScrollIntent();
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            context.onUserScrollIntent();
          }
        }}
        onKeyDown={(event) => {
          if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
            context.onUserScrollIntent();
          }
        }}
      />
    );
  })
};

const StreamEmbedFrame = memo(function StreamEmbedFrame({
  src,
  title,
  refreshKey
}: {
  src: string;
  title: string;
  refreshKey: number;
}) {
  return (
    <iframe
      key={`${src}:${refreshKey}`}
      src={src}
      title={title}
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen
    />
  );
});

type IntegrationState = "disabled" | "connecting" | "connected" | "subscribed" | "error";

type IntegrationStatus = {
  state: IntegrationState;
  detail: string;
  updatedAt: string;
};

type HealthResponse = {
  demoEnabled: boolean;
  messageCount: number;
  messageHistoryLimit: number;
  configuration: {
    envFileLoaded: boolean;
    envFilePath: string;
    liveSessionPath: string;
    realIngestionEnabled: boolean;
    demoForced: boolean;
    publicOnlyMode?: boolean;
    nativeChatSession?: {
      secretConfigured: boolean;
      sameSite: "lax" | "strict" | "none";
    };
    nativeModeration?: {
      mutedUserCount: number;
      mutedNetworkKeyCount?: number;
      mutedUsers: Array<{
        userId: string;
        displayName: string | null;
        mutedAt: string;
        reason: string | null;
        networkKeyCount?: number;
      }>;
    };
    operatorAuth?: {
      enabled: boolean;
      sessionSecretConfigured: boolean;
      sameSite: "lax" | "strict" | "none";
      csrfProtection?: boolean;
    };
    securityHeaders?: {
      embedAllowedOrigins: string[];
      frameAncestors: string;
    };
  };
  runtimeConfig?: {
    messageHistoryLimit: number;
    viewerPollMs: number;
    nativeChatRateLimit: number;
    nativeChatRateWindowMs: number;
  };
  liveSession: LiveSessionConfig;
  sources: ViewerSnapshot;
  publicDashboard: PublicDashboardConfig;
  integrations: {
    statuses: Partial<Record<Platform, IntegrationStatus>>;
    twitch: {
      enabled: boolean;
      oauthSessionStored: boolean;
      authorizedLogin: string | null;
      authorizedUserId: string | null;
      scopes: string[];
      broadcasterLogin: string | null;
      broadcasterUserId: string | null;
      trackedBroadcasters?: Array<{
        userId: string;
        login: string | null;
        displayName: string | null;
        addedAt: string;
        updatedAt: string;
      }>;
      credentialsPresent: {
        clientId: boolean;
        userAccessToken: boolean;
        broadcasterUserId: boolean;
        trackedBroadcasters?: boolean;
        userId: boolean;
      };
    };
    kick: {
      autoSubscribeEnabled?: boolean;
      ingress: string;
      webhookUrl?: string | null;
      oauthSessionStored?: boolean;
      authorizationMode?: "oauth" | "app" | "manual-token" | "missing";
      canSubscribe?: boolean;
      tokenSource?: "env" | "oauth" | null;
      ingestionEnabled?: boolean;
      scopes?: string[];
      expiresAt?: string | null;
      broadcasterUserId?: string | null;
      broadcasterSlug?: string | null;
      broadcasterName?: string | null;
      trackedBroadcasters?: Array<{
        userId: string;
        slug: string | null;
        name: string | null;
        subscriptionIds: string[];
        addedAt: string;
        updatedAt: string;
      }>;
      credentialsPresent?: {
        clientId?: boolean;
        clientSecret?: boolean;
        accessToken: boolean;
        broadcasterUserId: boolean;
        publicKey: boolean;
        webhookUrl?: boolean;
      };
    };
    x: {
      autoStartEnabled?: boolean;
      streamEnabled?: boolean;
      configured?: boolean;
      liveChatCapture?: {
        running: boolean;
        workerAutoStart?: boolean;
        profilePath: string;
        debugPort: number;
        chromeFound: boolean;
        startupTargets?: string[];
        configuredTargets?: Array<{
          id: string;
          input: string;
          targetUrl: string;
          channelName: string;
        }>;
        activeTargets?: Array<{
          id: string;
          targetUrl: string;
          channelName: string;
          startedAt: string;
        }>;
      };
      liveCapture?: {
        endpoint: string;
        scriptPath: string;
        tokenRequired: boolean;
        extensionOriginsAllowed?: boolean;
        allowedOrigins: string[];
      };
      mode: string;
      rawRules?: string;
      rules?: Array<{ value: string; tag?: string }>;
    };
  };
};

type LiveSessionConfig = {
  id: string;
  title: string;
  nativeChatLabel: string;
  streamLabel: string | null;
  streamEmbedUrl: string | null;
  streamWatchUrl: string | null;
  description: string;
  updatedAt: string;
};

type PublicDashboardConfig = {
  id?: string;
  title: string;
  nativeChatLabel: string;
  streamLabel?: string | null;
  streamEmbedUrl: string | null;
  streamWatchUrl: string | null;
  streamSources?: StreamSource[];
  description?: string;
  updatedAt?: string;
  publicUrl: string;
  embedUrl?: string;
  fullEmbedUrl?: string;
  chatEmbedUrl?: string;
  mockPageUrl?: string;
  publicConfigUrl?: string;
};

type NativeChatIdentity = {
  kind: "guest";
  clientId: string;
  displayName: string;
  issuedAt: string;
  lastSeenAt: string;
};

type NativeChatSessionResponse = {
  identity: NativeChatIdentity;
  nativeChatLabel: string;
  maxMessageLength: number;
};

type OperatorAuthStatus = {
  required: boolean;
  authenticated: boolean;
  csrfToken?: string | null;
  publicOnlyMode: boolean;
};

type XConnectSource = {
  id: string;
  input: string;
  label: string;
  url: string;
  username: string | null;
};

type InstallReadinessItem = {
  label: string;
  ready: boolean;
  detail: string;
};

type DemoRunbookItem = {
  label: string;
  detail: string;
  ready: boolean;
  href?: string;
};

function appendQueryParam(url: string, key: string, value: string) {
  if (url.startsWith("/")) {
    const [path, query = ""] = url.split("?");
    const params = new URLSearchParams(query);
    params.set(key, value);
    return `${path}?${params.toString()}`;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return parsed.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function iframeSnippet(options: { src: string; title: string; height: number; allowMedia?: boolean }) {
  const allow = options.allowMedia ? `\n  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"` : "";
  return `<iframe
  src="${options.src}"
  title="${options.title}"${allow}
  style="width: 100%; height: ${options.height}px; border: 0; display: block;"
></iframe>`;
}

function installReadinessItems(health: HealthResponse | null): InstallReadinessItem[] {
  const streamConfigured = Boolean(health?.liveSession.streamEmbedUrl || health?.liveSession.streamWatchUrl);
  const twitchTargets = health?.integrations.twitch.trackedBroadcasters?.length ?? 0;
  const kickTargets = health?.integrations.kick.trackedBroadcasters?.length ?? 0;
  const xActiveTargets = health?.integrations.x.liveChatCapture?.activeTargets?.length ?? 0;
  const xConfiguredTargets = uniqueXLiveChatSources([
    ...(health?.integrations.x.liveChatCapture?.startupTargets ?? []),
    ...(health?.integrations.x.rules?.map((rule) => rule.value) ?? [])
  ]).length;
  const hasRealChatTarget = twitchTargets + kickTargets + xConfiguredTargets > 0;
  const sameSite = health?.configuration.nativeChatSession?.sameSite ?? "lax";
  const operatorAuthEnabled = Boolean(health?.configuration.operatorAuth?.enabled);
  const operatorCsrfEnabled = Boolean(health?.configuration.operatorAuth?.csrfProtection);
  const adminDisabled = Boolean(health?.configuration.publicOnlyMode);
  const embedOrigins = health?.configuration.securityHeaders?.embedAllowedOrigins ?? [];

  return [
    {
      label: "Public URL",
      ready: Boolean(health?.publicDashboard.publicUrl),
      detail: health?.publicDashboard.publicUrl ?? "Open through the deployed public host."
    },
    {
      label: "Embed URL",
      ready: Boolean(health?.publicDashboard.embedUrl),
      detail: health?.publicDashboard.embedUrl ?? "Expose /embed from the deployed host."
    },
    {
      label: "Stream fallback",
      ready: streamConfigured,
      detail: streamConfigured ? "Stream or watch URL is configured." : "Set stream embed/watch URL for the event."
    },
    {
      label: "Native identity",
      ready: Boolean(health?.configuration.nativeChatSession?.secretConfigured),
      detail: health?.configuration.nativeChatSession?.secretConfigured
        ? `Signed guest sessions active with SameSite=${sameSite}.`
        : "Set NATIVE_CHAT_SESSION_SECRET before production."
    },
    {
      label: "Operator auth",
      ready: adminDisabled || operatorAuthEnabled,
      detail: adminDisabled
        ? "Admin dashboard is disabled in public-only mode."
        : operatorAuthEnabled
          ? `Operator login is required${operatorCsrfEnabled ? " with CSRF-protected mutations" : ""}.`
          : "Set ADMIN_PASSWORD before exposing the admin dashboard."
    },
    {
      label: "Embed allowlist",
      ready: embedOrigins.length > 0,
      detail:
        embedOrigins.length > 0
          ? `${embedOrigins.length} external frame origins allowed.`
          : "Set EMBED_ALLOWED_ORIGINS before third-party embedding."
    },
    {
      label: "Chat sources",
      ready: hasRealChatTarget,
      detail: hasRealChatTarget
        ? `${twitchTargets} Twitch, ${kickTargets} Kick, ${xConfiguredTargets} X configured (${xActiveTargets} worker${xActiveTargets === 1 ? "" : "s"} active).`
        : "Track at least one Twitch, Kick, or X source before launch."
    },
    {
      label: "Viewer-only mode",
      ready: Boolean(health?.configuration.publicOnlyMode),
      detail: health?.configuration.publicOnlyMode ? "Public-only mode is active." : "Set PUBLIC_LIVE_ONLY=true for adminless website deployment."
    }
  ];
}

function demoRunbookItems(input: {
  publicUrl: string;
  embedUrl: string;
  chatEmbedUrl: string;
  proofUrl: string;
  readinessItems: InstallReadinessItem[];
  hasNativeMutes: boolean;
}): DemoRunbookItem[] {
  const readiness = new Map(input.readinessItems.map((item) => [item.label, item]));
  const streamReady = Boolean(readiness.get("Stream fallback")?.ready);
  const chatReady = Boolean(readiness.get("Chat sources")?.ready);
  const identityReady = Boolean(readiness.get("Native identity")?.ready);
  const authReady = Boolean(readiness.get("Operator auth")?.ready);
  const embedReady = Boolean(readiness.get("Embed URL")?.ready && readiness.get("Embed allowlist")?.ready);

  return [
    {
      label: "Proof Page",
      detail: "Market Bubble page mock with the full product embedded.",
      ready: embedReady,
      href: input.proofUrl
    },
    {
      label: "Live Hub",
      detail: streamReady ? "Stream source is configured for the viewer surface." : "Set the stream URL before showing the viewer surface.",
      ready: streamReady,
      href: input.publicUrl
    },
    {
      label: "Shared Chat",
      detail: chatReady ? "At least one external chat source is tracked." : "Track Twitch, Kick, or X before a live-source demo.",
      ready: chatReady,
      href: input.chatEmbedUrl
    },
    {
      label: "Native Identity",
      detail: identityReady ? "Signed guest sessions are active." : "Set the native session secret before a public demo.",
      ready: identityReady,
      href: input.publicUrl
    },
    {
      label: "Moderation",
      detail: input.hasNativeMutes ? "Native mute hardening is active in this server session." : "Send a native message, then hide or mute it from admin.",
      ready: identityReady && authReady,
      href: input.publicUrl
    },
    {
      label: "Embed Handoff",
      detail: embedReady ? "Full and chat-only iframe URLs are ready for the website." : "Confirm embed URL and frame allowlist before handoff.",
      ready: embedReady,
      href: input.embedUrl
    }
  ];
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function PlatformLogo({ platform }: { platform: Platform }) {
  if (platform === "twitch") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 3h16v11.2l-4 4h-3.2L10 21H7v-2.8H4V3Zm3 3v9.2h3v2.4l2.4-2.4H15l2-2V6H7Z" />
        <path d="M10 8h2v4h-2V8Zm5 0h2v4h-2V8Z" />
      </svg>
    );
  }

  if (platform === "kick") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h6v5h2.2L16.7 4H22l-5.2 7.2L22 20h-5.6l-3.3-5.6H11V20H5V4Z" />
      </svg>
    );
  }

  if (platform === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.7 4h4.5l3.4 4.8L16.7 4h2.5l-5.5 6.4L20 20h-4.5l-3.8-5.5L7 20H4.5l6.1-7.1L4.7 4Zm2.9 1.8 8.9 12.4h1L8.6 5.8h-1Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5h16v10.2l-3.2 3.2h-4.1l-2.4 2.4-2.4-2.4H4V5.5Z" />
      <path className="platform-logo-cut" d="M7.2 13.3h2.2l1.5-2 2.1 2.7 3.5-5h1.9l-5.3 7.4-2.1-2.7-1 1.3H7.2v-1.7Z" />
    </svg>
  );
}

function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={`platform-badge platform-${platform}`} title={platformLabels[platform]}>
      <PlatformLogo platform={platform} />
      <span className="sr-only">{platformLabels[platform]}</span>
    </span>
  );
}

function ConnectionPill({ state }: { state: "connecting" | "connected" | "disconnected" }) {
  const Icon = state === "connected" ? Wifi : state === "disconnected" ? WifiOff : Radio;

  return (
    <span className={`connection-pill connection-${state}`}>
      <Icon size={14} aria-hidden="true" />
      <span className="connection-label">{state}</span>
    </span>
  );
}

function IntegrationDot({ state }: { state: IntegrationState | undefined }) {
  return <span className={`integration-dot integration-${state ?? "disabled"}`} aria-hidden="true" />;
}

function formatViewerCount(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)}%`;
}

function displayBrandText(value: string) {
  return value.replace(/\bMarketBubble\b/g, "Market Bubble");
}

function sourceTitle(message: ChatMessage) {
  const sourceLabel = displayBrandText(message.sourceLabel ?? message.channelName ?? platformLabels[message.platform]);
  return `${platformLabels[message.platform]} / ${sourceLabel}`;
}

function ViewerSummary({ snapshot }: { snapshot: ViewerSnapshot }) {
  const sourceLines = snapshot.sources.length
    ? snapshot.sources
        .map((source) => {
          const count = source.viewerCount === null ? "unknown" : formatViewerCount(source.viewerCount);
          return `${platformLabels[source.platform]} / ${displayBrandText(source.label)}: ${count}`;
        })
        .join("\n")
    : "No active sources";

  return (
    <div className="viewer-summary" title={sourceLines}>
      <button className="viewer-total" type="button" aria-label="Combined viewer count">
        <Eye size={15} aria-hidden="true" />
        <span>{formatViewerCount(snapshot.totalKnownViewers)}</span>
      </button>
      <div className="viewer-popover" role="tooltip">
        {snapshot.sources.length > 0 ? (
          snapshot.sources.map((source) => (
            <div className="viewer-source-row" key={source.id}>
              <div>
                <PlatformBadge platform={source.platform} />
                <span>{displayBrandText(source.label)}</span>
              </div>
              <strong>{source.viewerCount === null ? "unknown" : formatViewerCount(source.viewerCount)}</strong>
            </div>
          ))
        ) : (
          <span className="viewer-source-empty">No active sources</span>
        )}
      </div>
    </div>
  );
}

function StreamSourceMark({ source }: { source: StreamSource }) {
  if (source.platform) {
    return <PlatformBadge platform={source.platform} />;
  }

  return <span className="stream-primary-badge">LIVE</span>;
}

function streamSourceMeta(source: StreamSource) {
  const pieces = [
    source.status === "live" ? "Live" : source.status === "offline" ? "Offline" : source.status === "connected" ? "Connected" : null,
    source.viewerCount === null ? null : `${formatViewerCount(source.viewerCount)} viewers`
  ].filter(Boolean);

  return displayBrandText(pieces.length > 0 ? pieces.join(" / ") : source.detail ?? "Feed available");
}

function isDevelopmentStreamSource(source: StreamSource) {
  return source.id.startsWith("local-dev:") || source.id.includes(":local-dev") || source.label.trim().toLowerCase() === "local development";
}

function MessageContent({
  message,
  showEmotes,
  showBetterTtvEmotes,
  betterTtvEmotes
}: {
  message: ChatMessage;
  showEmotes: boolean;
  showBetterTtvEmotes: boolean;
  betterTtvEmotes: BetterTtvEmoteMap;
}) {
  const baseFragments = message.fragments.length > 0 ? message.fragments : [{ type: "text" as const, text: message.message, url: null }];
  const fragments = showEmotes && showBetterTtvEmotes ? expandBetterTtvFragments(baseFragments, betterTtvEmotes) : baseFragments;

  return (
    <span className="message-text">
      {fragments.map((fragment, index) => {
        const key = `${index}:${fragment.type}:${fragment.text}`;

        if (showEmotes && fragment.type === "emote" && fragment.url) {
          return (
            <span className="message-emote-wrap" key={key} title={fragment.text}>
              <img className="message-emote" src={fragment.url} alt={fragment.text} loading="lazy" referrerPolicy="no-referrer" />
            </span>
          );
        }

        return (
          <span className={`message-fragment message-fragment-${fragment.type}`} key={key}>
            {fragment.text}
          </span>
        );
      })}
    </span>
  );
}

function MessageRow({
  message,
  preferences,
  betterTtvEmotes,
  moderation
}: {
  message: ChatMessage;
  preferences: ChatPreferences;
  betterTtvEmotes: BetterTtvEmoteMap;
  moderation?: {
    canRemove: boolean;
    removePending: boolean;
    onRemove: () => void;
    canMuteUser: boolean;
    mutePending: boolean;
    onMuteUser: () => void;
  };
}) {
  const [metadataOpen, setMetadataOpen] = useState(false);
  const displayName = message.displayName ?? message.username;
  const originLabel = sourceTitle(message);
  const sourceLabel = displayBrandText(message.sourceLabel ?? message.channelName ?? platformLabels[message.platform]);
  const badgeTitle = message.badges.map((badge) => badge.label).filter(Boolean).join(", ");
  const platformUserId = message.platformUserId ?? "unknown";
  const usernameTitle = [
    displayName,
    message.platformUserId ? `ID: ${platformUserId}` : null,
    badgeTitle ? `Badges: ${badgeTitle}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <article className={`message-row message-row-${message.platform} message-style-${preferences.messageStyle}`}>
      <div className="message-line">
        {preferences.showPlatform ? <PlatformBadge platform={message.platform} /> : null}
        {preferences.showTimestamp ? <time className="message-time">{formatTime(message.sentAt ?? message.receivedAt)}</time> : null}
        {preferences.showSource ? (
          <span className="message-channel" title={originLabel}>
            {sourceLabel}
          </span>
        ) : null}
        <span className="message-identity" onMouseEnter={() => setMetadataOpen(true)} onMouseLeave={() => setMetadataOpen(false)}>
          <span
            className="message-username"
            title={usernameTitle}
            tabIndex={0}
            onClick={() => setMetadataOpen((open) => !open)}
            onFocus={() => setMetadataOpen(true)}
            onBlur={() => setMetadataOpen(false)}
            style={{ color: message.color ?? platformColors[message.platform] }}
          >
            {displayName}
          </span>
          <span className={`message-hover-card message-hover-card-${message.platform} ${metadataOpen ? "message-hover-card-visible" : ""}`} role="tooltip">
            <span className="message-hover-card-top">
              <PlatformBadge platform={message.platform} />
              <span>
                <strong>{displayName}</strong>
                <span>{sourceLabel}</span>
              </span>
            </span>
            <span className="message-hover-card-meta">
              <span>Platform</span>
              <strong>{platformLabels[message.platform]}</strong>
            </span>
            <span className="message-hover-card-meta">
              <span>User ID</span>
              <strong>{platformUserId}</strong>
            </span>
            {badgeTitle ? (
              <span className="message-hover-card-meta">
                <span>Badges</span>
                <strong>{badgeTitle}</strong>
              </span>
            ) : null}
          </span>
        </span>
        <span className="message-separator">:</span>
        <MessageContent
          message={message}
          showEmotes={preferences.showEmotes}
          showBetterTtvEmotes={preferences.showBetterTtvEmotes}
          betterTtvEmotes={betterTtvEmotes}
        />
        {moderation?.canRemove || moderation?.canMuteUser ? (
          <span className="message-moderation-actions" aria-label="Native chat moderation">
            {moderation.canRemove ? (
              <button
                className="message-moderation-button"
                type="button"
                title="Hide native message"
                aria-label={`Hide native message from ${displayName}`}
                disabled={moderation.removePending}
                onClick={moderation.onRemove}
              >
                <X size={12} aria-hidden="true" />
              </button>
            ) : null}
            {moderation.canMuteUser ? (
              <button
                className="message-moderation-button message-moderation-button-strong"
                type="button"
                title="Mute native guest, browser, and network"
                aria-label={`Mute native guest ${displayName}`}
                disabled={moderation.mutePending}
                onClick={moderation.onMuteUser}
              >
                <UserX size={12} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function PreferencesPanel({
  presentation = "modal",
  preferences,
  visualPreset,
  onClose,
  onReset,
  onSetMessageStyle,
  onSetPreference,
  onSetVisualPreset
}: {
  presentation?: "modal" | "sheet";
  preferences: ChatPreferences;
  visualPreset: VisualPreset;
  onClose: () => void;
  onReset: () => void;
  onSetMessageStyle: (style: MessageStyle) => void;
  onSetPreference: (key: keyof Omit<ChatPreferences, "messageStyle">, value: boolean) => void;
  onSetVisualPreset: (preset: VisualPreset) => void;
}) {
  const selectedStyle = messageStyleOptions.find((option) => option.id === preferences.messageStyle) ?? messageStyleOptions[0];

  return (
    <div
      className={`preferences-overlay preferences-overlay-${presentation}`}
      role="dialog"
      aria-modal={presentation === "modal"}
      aria-labelledby="preferences-title"
    >
      <section className="preferences-panel">
        <div className="preferences-header">
          <div>
            <SlidersHorizontal size={18} aria-hidden="true" />
            <div>
              <h2 id="preferences-title">Site Preferences</h2>
              <span>Saved on this device</span>
            </div>
          </div>
          <button className="icon-button" type="button" title="Close preferences" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="preferences-content">
          <section className="preferences-section">
            <div className="preferences-section-title">
              <Palette size={15} aria-hidden="true" />
              <strong>Appearance</strong>
            </div>
            <label className="preferences-select-row">
              <span>Theme</span>
              <select value={visualPreset} onChange={(event) => onSetVisualPreset(event.target.value as VisualPreset)}>
                {visualPresets.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="preferences-section">
            <div className="preferences-section-title">
              <MessageCircle size={15} aria-hidden="true" />
              <strong>Chat Rows</strong>
            </div>
            <div className="preferences-segmented" role="radiogroup" aria-label="Chat row style">
              {messageStyleOptions.map((option) => (
                <button
                  className={preferences.messageStyle === option.id ? "preferences-segment preferences-segment-active" : "preferences-segment"}
                  type="button"
                  role="radio"
                  aria-checked={preferences.messageStyle === option.id}
                  key={option.id}
                  onClick={() => onSetMessageStyle(option.id)}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <p className="preferences-style-note">{selectedStyle.description}</p>

            <div className="preferences-toggle-grid">
              <label className="preference-toggle">
                <input
                  type="checkbox"
                  checked={preferences.showPlatform}
                  onChange={(event) => onSetPreference("showPlatform", event.target.checked)}
                />
                <span>Platform</span>
              </label>
              <label className="preference-toggle">
                <input
                  type="checkbox"
                  checked={preferences.showTimestamp}
                  onChange={(event) => onSetPreference("showTimestamp", event.target.checked)}
                />
                <span>Time</span>
              </label>
              <label className="preference-toggle">
                <input
                  type="checkbox"
                  checked={preferences.showSource}
                  onChange={(event) => onSetPreference("showSource", event.target.checked)}
                />
                <span>Source</span>
              </label>
              <label className="preference-toggle">
                <input
                  type="checkbox"
                  checked={preferences.showEmotes}
                  onChange={(event) => onSetPreference("showEmotes", event.target.checked)}
                />
                <span>Emotes</span>
              </label>
              <label className="preference-toggle">
                <input
                  type="checkbox"
                  checked={preferences.showBetterTtvEmotes}
                  disabled={!preferences.showEmotes}
                  onChange={(event) => onSetPreference("showBetterTtvEmotes", event.target.checked)}
                />
                <span>BetterTTV</span>
              </label>
            </div>
          </section>

          <section className="preferences-section">
            <div className="preferences-section-title">
              <Eye size={15} aria-hidden="true" />
              <strong>Preview</strong>
            </div>
            <div className="preferences-preview">
              <MessageRow
                message={preferencePreviewMessage}
                preferences={preferences}
                betterTtvEmotes={preferences.showBetterTtvEmotes ? preferencePreviewBetterTtvEmotes : {}}
              />
            </div>
          </section>
        </div>

        <div className="preferences-footer">
          <button className="secondary-button" type="button" onClick={onReset}>
            Reset
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

function XConnectPanel({
  sources,
  activeTargets,
  status,
  bridgePath,
  tokenRequired,
  chromeFound,
  workerRunning,
  workerAutoStart,
  onClose,
  onStartWorkers,
  onStopWorkers,
  onStopTarget
}: {
  sources: XConnectSource[];
  activeTargets: NonNullable<HealthResponse["integrations"]["x"]["liveChatCapture"]>["activeTargets"];
  status: string;
  bridgePath: string;
  tokenRequired: boolean;
  chromeFound: boolean;
  workerRunning: boolean;
  workerAutoStart: boolean;
  onClose: () => void;
  onStartWorkers: () => void;
  onStopWorkers: () => void;
  onStopTarget: (targetId: string) => void;
}) {
  return (
    <div className="preferences-overlay" role="dialog" aria-modal="true" aria-labelledby="x-connect-title">
      <section className="preferences-panel x-connect-panel">
        <div className="preferences-header">
          <div>
            <PlatformBadge platform="x" />
            <div>
              <h2 id="x-connect-title">Connect X Sources</h2>
              <span>{sources.length > 0 ? `${sources.length} configured livechat source${sources.length === 1 ? "" : "s"}` : "No X livechat sources configured"}</span>
            </div>
          </div>
          <button className="icon-button" type="button" title="Close X source setup" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="preferences-content x-connect-content">
          <section className="preferences-section x-connect-hero">
            <div>
              <strong>Operator capture setup</strong>
              <span>Open each X livechat in this browser, then run the capture bridge or a local server worker.</span>
            </div>
            <div className="x-connect-actions">
              {sources[0] ? (
                <a className="primary-button" href={sources[0].url} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} aria-hidden="true" />
                  Open First X Tab
                </a>
              ) : (
                <button className="primary-button" type="button" disabled>
                  <ExternalLink size={15} aria-hidden="true" />
                  Open First X Tab
                </button>
              )}
              <button className="secondary-button" type="button" onClick={onStartWorkers} disabled={sources.length === 0}>
                <RefreshCw size={15} aria-hidden="true" />
                Start Workers
              </button>
            </div>
          </section>

          <section className="preferences-section">
            <div className="preferences-section-title">
              <MessageCircle size={15} aria-hidden="true" />
              <strong>Configured Sources</strong>
            </div>
            <div className="x-source-list">
              {sources.length > 0 ? (
                sources.map((source) => (
                  <div className="x-source-row" key={source.id}>
                    <div>
                      <PlatformBadge platform="x" />
                      <span>
                        <strong>{source.label}</strong>
                        <em>{source.url}</em>
                      </span>
                    </div>
                    <div className="x-source-row-actions">
                      <a className="secondary-button" href={source.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} aria-hidden="true" />
                        Open
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <span className="settings-target-empty">Add X targets in rules or X_LIVE_CHAT_TARGETS.</span>
              )}
            </div>
          </section>

          <section className="preferences-section">
            <div className="preferences-section-title">
              <Radio size={15} aria-hidden="true" />
              <strong>Capture Methods</strong>
            </div>
            <div className="x-capture-grid">
              <div className="x-capture-card x-capture-card-recommended">
                <strong>Browser bridge</strong>
                <span>{bridgePath}</span>
                <em>{tokenRequired ? "Token required" : "Bridge ready"}</em>
              </div>
              <div className="x-capture-card">
                <strong>Server worker</strong>
                <span>{chromeFound ? "Chrome found" : "Chrome missing"}</span>
                <em>{workerRunning ? "Running" : workerAutoStart ? "Auto-start on" : "Auto-start off"}</em>
              </div>
              <div className="x-capture-card">
                <strong>Live tabs</strong>
                <span>{sources.length > 0 ? "Ready to open" : "No sources"}</span>
                <em>Current browser</em>
              </div>
            </div>
          </section>

          <section className="preferences-section">
            <div className="preferences-section-title">
              <Wifi size={15} aria-hidden="true" />
              <strong>Active Workers</strong>
            </div>
            <div className="settings-target-list" aria-label="Active X workers">
              {activeTargets && activeTargets.length > 0 ? (
                activeTargets.map((target) => (
                  <span className="settings-target-chip" key={target.id}>
                    <span>{target.channelName}</span>
                    <button className="ghost-icon" type="button" title={`Stop ${target.channelName}`} onClick={() => onStopTarget(target.id)}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="settings-target-empty">No server workers are active.</span>
              )}
            </div>
            {activeTargets && activeTargets.length > 0 ? (
              <button className="secondary-button danger-button x-connect-stop-all" type="button" onClick={onStopWorkers}>
                <LogOut size={14} aria-hidden="true" />
                Stop All Workers
              </button>
            ) : null}
          </section>

          {status ? <div className="x-connect-status">{status}</div> : null}
        </div>

        <div className="preferences-footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
          {sources[0] ? (
            <a className="primary-button" href={sources[0].url} target="_blank" rel="noreferrer">
              Open First
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MarketBubbleMockPage() {
  return (
    <main className="mb-site-proof">
      <section className="mb-site-hero" style={{ backgroundImage: `url("${marketBubbleMockHeroImage}")` }}>
        <header className="mb-site-nav">
          <a className="mb-site-wordmark" href="#top" aria-label="Market Bubble home">
            Market Bubble
          </a>
          <nav aria-label="Market Bubble proof navigation">
            <a href="#live-room">Live</a>
            <a href="#shared-chat">Chat</a>
            <a href="/embed" target="_blank" rel="noreferrer">
              Open Hub
            </a>
          </nav>
        </header>
        <div className="mb-site-hero-copy" id="top">
          <span>LIVE / THURDAYS / 1PM PST</span>
          <h1>Market Bubble</h1>
          <p>One native room for the show, the stream, and every platform conversation.</p>
          <div className="mb-site-hero-actions">
            <a className="mb-site-primary-link" href="#live-room">
              Enter Live Room
            </a>
            <a className="mb-site-secondary-link" href="#shared-chat">
              View Shared Chat
            </a>
          </div>
        </div>
      </section>

      <section className="mb-site-live" id="live-room" aria-label="Market Bubble embedded live room proof">
        <div className="mb-site-section-heading">
          <span>Native live hub</span>
          <h2>The broadcast, source switcher, and combined chat live inside the Market Bubble page.</h2>
          <p>
            This iframe is the same drop-in product surface intended for the production website. The host page keeps
            the cinematic Market Bubble feel while the embedded app handles realtime chat, native identity, stream
            switching, and viewer preferences.
          </p>
        </div>
        <div className="mb-site-live-frame">
          <iframe
            src="/embed"
            title="Market Bubble embedded live hub"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          />
        </div>
      </section>

      <section className="mb-site-chat-demo" id="shared-chat" aria-label="Market Bubble chat-only proof">
        <div className="mb-site-chat-copy">
          <span>Shared chat module</span>
          <h2>When the site owns the stream, the chat can stand alone.</h2>
          <p>
            The chat-only embed gives Market Bubble a flexible module for show pages, article pages, event pages, or
            any layout where the stream is already handled by the website.
          </p>
          <ul>
            <li>Server-issued guest identity for native chat.</li>
            <li>Twitch, Kick, X, and Market Bubble messages in one feed.</li>
            <li>Dense streamer-friendly rows for high-volume broadcasts.</li>
          </ul>
        </div>
        <div className="mb-site-chat-frame">
          <iframe src="/embed?view=chat" title="Market Bubble shared chat embed" />
        </div>
      </section>
    </main>
  );
}

function normalizeAccountName(value: string) {
  return value
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(?:www\.)?(?:kick\.com|x\.com|twitter\.com)\//i, "")
    .split(/[/?#]/)[0]
    .trim();
}

function accountNameFromXRules(value: string | undefined) {
  const firstRule = value
    ?.split(";")
    .map((rule) => rule.trim())
    .find(Boolean);

  if (!firstRule) {
    return "";
  }

  const [ruleValue] = firstRule.split("|").map((part) => part.trim());
  const fromMatch = /^from:([A-Za-z0-9_]{1,15})$/i.exec(ruleValue);
  const mentionMatch = /^@([A-Za-z0-9_]{1,15})$/i.exec(ruleValue);
  return fromMatch?.[1] ?? mentionMatch?.[1] ?? "";
}

function xAccountRules(accountName: string) {
  const normalizedAccountName = normalizeAccountName(accountName);
  return normalizedAccountName ? `from:${normalizedAccountName}|${normalizedAccountName}` : "";
}

function xLiveChatSourceFromInput(input: string): XConnectSource | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const username = url.pathname.split("/").filter(Boolean)[0] ?? null;
      const normalizedUsername = username && username !== "i" ? normalizeAccountName(username) : "";
      const liveChatUrl = normalizedUsername ? `https://x.com/${normalizedUsername}/livechat` : trimmed;
      return {
        id: liveChatUrl.toLowerCase(),
        input: trimmed,
        label: normalizedUsername ? `@${normalizedUsername}` : "X livechat",
        url: liveChatUrl,
        username: normalizedUsername || null
      };
    } catch {
      return null;
    }
  }

  const username = normalizeAccountName(trimmed);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return null;
  }

  return {
    id: username.toLowerCase(),
    input: trimmed,
    label: `@${username}`,
    url: `https://x.com/${username}/livechat`,
    username
  };
}

function xLiveChatInputsFromRules(value: string | undefined) {
  return (value ?? "")
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => rule.split("|")[0]?.trim() ?? "")
    .map((ruleValue) => {
      const fromMatch = /^from:([A-Za-z0-9_]{1,15})$/i.exec(ruleValue);
      const mentionMatch = /^@([A-Za-z0-9_]{1,15})$/i.exec(ruleValue);
      return fromMatch?.[1] ?? mentionMatch?.[1] ?? ruleValue;
    })
    .filter(Boolean);
}

function uniqueXLiveChatSources(inputs: string[]) {
  const seen = new Set<string>();
  const sources: XConnectSource[] = [];

  for (const input of inputs) {
    const source = xLiveChatSourceFromInput(input);
    if (!source || seen.has(source.id)) {
      continue;
    }

    seen.add(source.id);
    sources.push(source);
  }

  return sources;
}

async function responseErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function parseIntegerInput(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : null;
}

const preferencePreviewMessage: ChatMessage = {
  id: "preview:twitch",
  platform: "twitch",
  sourceKind: "chat",
  platformMessageId: "preview",
  platformUserId: "preview-user",
  username: "marketwatcher",
  displayName: "MarketWatcher",
  channelId: "preview-channel",
  channelName: "Market Bubble",
  sourceId: "twitch:market-bubble",
  sourceLabel: "Market Bubble",
  sourceUrl: "https://www.twitch.tv/marketbubble",
  message: "This setup keeps chat readable Kappa monkaS",
  fragments: [
    { type: "text", text: "This setup keeps chat readable ", url: null },
    { type: "emote", text: "Kappa", url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0" },
    { type: "text", text: " monkaS", url: null }
  ],
  badges: [{ label: "Subscriber", type: "subscriber", count: 12 }],
  avatarUrl: null,
  color: "#a970ff",
  sentAt: "2026-06-10T18:00:00.000Z",
  receivedAt: "2026-06-10T18:00:00.000Z"
};

const preferencePreviewBetterTtvEmotes: BetterTtvEmoteMap = {
  monkaS: "https://cdn.betterttv.net/emote/56e9f494fff3cc5c35e5287e/1x"
};

function OperatorLoginPage({
  password,
  message,
  submitting,
  onPasswordChange,
  onSubmit
}: {
  password: string;
  message: string;
  submitting: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="operator-login-shell">
      <form className="operator-login-card" onSubmit={onSubmit}>
        <div className="operator-login-mark">
          <Radio size={18} aria-hidden="true" />
        </div>
        <div className="operator-login-copy">
          <span>Operator Access</span>
          <h1>Market Bubble Live Desk</h1>
          <p>Sign in to manage platform connections, runtime settings, and website install details.</p>
        </div>
        <label className="operator-login-field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Operator password"
          />
        </label>
        {message ? (
          <div className="operator-login-message" role="status">
            {message}
          </div>
        ) : null}
        <button className="primary-button" type="submit" disabled={submitting}>
          <LogIn size={16} aria-hidden="true" />
          {submitting ? "Signing In" : "Sign In"}
        </button>
        <div className="operator-login-links">
          <a href="/live">Public live page</a>
          <a href="/embed">Website embed</a>
        </div>
      </form>
    </main>
  );
}

export function App() {
  const isMarketBubbleMockPage = window.location.pathname.startsWith("/mock-marketbubble");
  const isEmbeddedDashboard = window.location.pathname.startsWith("/embed");
  const embeddedView = new URLSearchParams(window.location.search).get("view");
  const isChatOnlyEmbed = isEmbeddedDashboard && embeddedView === "chat";
  const isPublicDashboard = window.location.pathname.startsWith("/live") || isEmbeddedDashboard;
  const isAdminDashboard = !isPublicDashboard && !isMarketBubbleMockPage;
  const { messages, setMessages, connectionState, counts, sourceSnapshot } = useChatStream(
    isPublicDashboard || isMarketBubbleMockPage ? "viewer" : "admin"
  );
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const previousVisibleMessageCount = useRef(0);
  const previousLiveMessageIds = useRef<string[]>([]);
  const lastScrollTop = useRef(0);
  const userScrollIntentUntil = useRef(0);
  const suppressScrollLockUntil = useRef(0);
  const readingLockedRef = useRef(false);
  const twitchBroadcasterEdited = useRef(false);
  const kickBroadcasterEdited = useRef(false);
  const xTargetAccountEdited = useRef(false);
  const xRulesEdited = useRef(false);
  const liveSessionEdited = useRef(false);
  const runtimeConfigEdited = useRef(false);
  const betterTtvGlobalStatus = useRef<"idle" | "loading" | "loaded">("idle");
  const betterTtvFetchedChannels = useRef(new Set<string>());
  const betterTtvLoadingChannels = useRef(new Set<string>());
  const publicConfigSignature = useRef("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [enabledPlatforms, setEnabledPlatforms] = useState<Record<Platform, boolean>>({
    twitch: true,
    kick: true,
    x: true,
    marketbubble: true
  });
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [readingLocked, setReadingLocked] = useState(false);
  const [lockedMessages, setLockedMessages] = useState<ChatMessage[] | null>(null);
  const [newMessagesAway, setNewMessagesAway] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [xConnectOpen, setXConnectOpen] = useState(false);
  const [xConnectStatus, setXConnectStatus] = useState("");
  const [adminActionsOpen, setAdminActionsOpen] = useState(false);
  const [settingsPlatformMenuOpen, setSettingsPlatformMenuOpen] = useState(false);
  const [chatPreferences, setChatPreferences] = useState<ChatPreferences>(() => initialChatPreferences());
  const [activeSettingsPlatform, setActiveSettingsPlatform] = useState<Exclude<Platform, "marketbubble">>("twitch");
  const [broadcasterLogin, setBroadcasterLogin] = useState("");
  const [kickBroadcaster, setKickBroadcaster] = useState("");
  const [xTargetAccount, setXTargetAccount] = useState("");
  const [xRules, setXRules] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionNativeChatLabel, setSessionNativeChatLabel] = useState("");
  const [sessionStreamLabel, setSessionStreamLabel] = useState("");
  const [sessionStreamEmbedUrl, setSessionStreamEmbedUrl] = useState("");
  const [sessionStreamWatchUrl, setSessionStreamWatchUrl] = useState("");
  const [sessionDescription, setSessionDescription] = useState("");
  const [runtimeMessageHistoryLimit, setRuntimeMessageHistoryLimit] = useState("");
  const [runtimeViewerPollSeconds, setRuntimeViewerPollSeconds] = useState("");
  const [runtimeNativeRateLimit, setRuntimeNativeRateLimit] = useState("");
  const [runtimeNativeRateWindowSeconds, setRuntimeNativeRateWindowSeconds] = useState("");
  const [mockText, setMockText] = useState("Testing the unified feed monkaS");
  const [mockPlatform, setMockPlatform] = useState<Platform>("twitch");
  const [publicConfig, setPublicConfig] = useState<PublicDashboardConfig | null>(null);
  const [activeStreamSourceId, setActiveStreamSourceId] = useState(() => window.localStorage.getItem("ls-chat-active-stream-source") ?? "");
  const [streamSourceMenuOpen, setStreamSourceMenuOpen] = useState(false);
  const [streamFrameRefreshKey, setStreamFrameRefreshKey] = useState(0);
  const [nativeClientId] = useState(() => initialNativeClientId());
  const [nativeIdentity, setNativeIdentity] = useState<NativeChatIdentity | null>(null);
  const [nativeMessage, setNativeMessage] = useState("");
  const [nativeStatus, setNativeStatus] = useState("");
  const [moderationStatus, setModerationStatus] = useState("");
  const [moderatingMessageIds, setModeratingMessageIds] = useState<Set<string>>(() => new Set());
  const [mutingNativeUserIds, setMutingNativeUserIds] = useState<Set<string>>(() => new Set());
  const [visualPreset, setVisualPreset] = useState<VisualPreset>(() => initialVisualPreset());
  const [betterTtvGlobalEmotes, setBetterTtvGlobalEmotes] = useState<BetterTtvEmoteMap>({});
  const [betterTtvChannelEmotes, setBetterTtvChannelEmotes] = useState<Record<string, BetterTtvEmoteMap>>({});
  const [operatorAuth, setOperatorAuth] = useState<OperatorAuthStatus | null>(
    isAdminDashboard ? null : { required: false, authenticated: true, csrfToken: null, publicOnlyMode: false }
  );
  const [operatorPassword, setOperatorPassword] = useState("");
  const [operatorAuthMessage, setOperatorAuthMessage] = useState("");
  const [operatorAuthSubmitting, setOperatorAuthSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = visualPreset;
    window.localStorage.setItem("ls-chat-visual-preset", visualPreset);
  }, [visualPreset]);

  useEffect(() => {
    writeChatPreferences(window.localStorage, chatPreferences);
  }, [chatPreferences]);

  useEffect(() => {
    if (!chatPreferences.showEmotes || !chatPreferences.showBetterTtvEmotes || betterTtvGlobalStatus.current !== "idle") {
      return undefined;
    }

    let active = true;
    betterTtvGlobalStatus.current = "loading";
    fetchBetterTtvEmoteMap("/api/emotes/betterttv/global")
      .then((emotes) => {
        if (active) {
          setBetterTtvGlobalEmotes(emotes);
          betterTtvGlobalStatus.current = "loaded";
        }
      })
      .catch(() => {
        if (active) {
          betterTtvGlobalStatus.current = "idle";
        }
      });

    return () => {
      active = false;
    };
  }, [chatPreferences.showBetterTtvEmotes, chatPreferences.showEmotes]);

  useEffect(() => {
    if (!chatPreferences.showEmotes || !chatPreferences.showBetterTtvEmotes) {
      return undefined;
    }

    const channelIds = Array.from(
      new Set(
        messages
          .filter((message) => message.platform === "twitch" && message.channelId && /^\d+$/.test(message.channelId))
          .map((message) => message.channelId as string)
          .filter((channelId) => !betterTtvFetchedChannels.current.has(channelId) && !betterTtvLoadingChannels.current.has(channelId))
      )
    ).slice(0, 12);

    if (channelIds.length === 0) {
      return undefined;
    }

    let active = true;
    channelIds.forEach((channelId) => betterTtvLoadingChannels.current.add(channelId));
    void Promise.all(
      channelIds.map(async (channelId) => {
        try {
          return [channelId, await fetchBetterTtvEmoteMap(`/api/emotes/betterttv/twitch/${encodeURIComponent(channelId)}`), true] as const;
        } catch {
          return [channelId, {}, false] as const;
        }
      })
    ).then((entries) => {
      if (!active) {
        return;
      }

      setBetterTtvChannelEmotes((current) => {
        const next = { ...current };
        for (const [channelId, emotes, succeeded] of entries) {
          if (succeeded) {
            next[channelId] = emotes;
            betterTtvFetchedChannels.current.add(channelId);
          }
          betterTtvLoadingChannels.current.delete(channelId);
        }
        return next;
      });
    });

    return () => {
      active = false;
      channelIds.forEach((channelId) => betterTtvLoadingChannels.current.delete(channelId));
    };
  }, [chatPreferences.showBetterTtvEmotes, chatPreferences.showEmotes, messages]);

  const loadOperatorAuth = useCallback(async () => {
    if (!isAdminDashboard) {
      return;
    }

    try {
      const response = await fetch("/api/operator-auth/status", { credentials: "same-origin" });
      if (!response.ok) {
        setOperatorAuth({ required: false, authenticated: true, csrfToken: null, publicOnlyMode: false });
        return;
      }

      setOperatorAuth((await response.json()) as OperatorAuthStatus);
    } catch {
      setOperatorAuth({ required: false, authenticated: true, csrfToken: null, publicOnlyMode: false });
    }
  }, [isAdminDashboard]);

  useEffect(() => {
    void loadOperatorAuth();
  }, [loadOperatorAuth]);

  const loadHealth = useCallback(async () => {
    const response = await fetch("/api/health", { credentials: "same-origin" });
    if (!response.ok) {
      if (response.status === 401) {
        setOperatorAuth({ required: true, authenticated: false, csrfToken: null, publicOnlyMode: false });
      }
      return;
    }
    const nextHealth = (await response.json()) as HealthResponse;
    setHealth(nextHealth);
    if (!twitchBroadcasterEdited.current && !broadcasterLogin && nextHealth.integrations.twitch.broadcasterLogin) {
      setBroadcasterLogin(nextHealth.integrations.twitch.broadcasterLogin);
    }
    if (!kickBroadcasterEdited.current && !kickBroadcaster) {
      const nextKickBroadcaster =
        nextHealth.integrations.kick.broadcasterSlug ??
        nextHealth.integrations.kick.broadcasterName ??
        nextHealth.integrations.kick.broadcasterUserId;
      if (nextKickBroadcaster) {
        setKickBroadcaster(nextKickBroadcaster);
      }
    }
    if (!xRulesEdited.current && !xRules && nextHealth.integrations.x.rawRules) {
      setXRules(nextHealth.integrations.x.rawRules);
    }
    if (!xTargetAccountEdited.current && !xTargetAccount) {
      const nextXTargetAccount = accountNameFromXRules(nextHealth.integrations.x.rawRules);
      if (nextXTargetAccount) {
        setXTargetAccount(nextXTargetAccount);
      }
    }
    if (!liveSessionEdited.current) {
      setSessionTitle(displayBrandText(nextHealth.liveSession.title));
      setSessionNativeChatLabel(displayBrandText(nextHealth.liveSession.nativeChatLabel));
      setSessionStreamLabel(nextHealth.liveSession.streamLabel ? displayBrandText(nextHealth.liveSession.streamLabel) : "");
      setSessionStreamEmbedUrl(nextHealth.liveSession.streamEmbedUrl ?? "");
      setSessionStreamWatchUrl(nextHealth.liveSession.streamWatchUrl ?? "");
      setSessionDescription(nextHealth.liveSession.description ? displayBrandText(nextHealth.liveSession.description) : "");
    }
    if (!runtimeConfigEdited.current && nextHealth.runtimeConfig) {
      setRuntimeMessageHistoryLimit(String(nextHealth.runtimeConfig.messageHistoryLimit));
      setRuntimeViewerPollSeconds(String(Math.round(nextHealth.runtimeConfig.viewerPollMs / 1000)));
      setRuntimeNativeRateLimit(String(nextHealth.runtimeConfig.nativeChatRateLimit));
      setRuntimeNativeRateWindowSeconds(String(Math.round(nextHealth.runtimeConfig.nativeChatRateWindowMs / 1000)));
    }
  }, [broadcasterLogin, kickBroadcaster, xRules, xTargetAccount]);

  useEffect(() => {
    if (!isAdminDashboard || operatorAuth === null || (operatorAuth.required && !operatorAuth.authenticated)) {
      return undefined;
    }

    void loadHealth();
    const interval = window.setInterval(() => void loadHealth(), 5000);
    return () => window.clearInterval(interval);
  }, [isAdminDashboard, loadHealth, operatorAuth]);

  const adminFetch = useCallback(
    (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const method = (init.method ?? "GET").toUpperCase();

      if (operatorAuth?.csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
        headers.set("X-MB-CSRF", operatorAuth.csrfToken);
      }

      return fetch(input, {
        ...init,
        credentials: init.credentials ?? "same-origin",
        headers
      });
    },
    [operatorAuth?.csrfToken]
  );

  useEffect(() => {
    if (!isPublicDashboard) {
      return undefined;
    }

    let active = true;
    const loadPublicConfig = () => {
      fetch("/api/public/config")
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { dashboard?: PublicDashboardConfig } | null) => {
          if (active && body?.dashboard) {
            const nextSignature = JSON.stringify(body.dashboard);
            if (nextSignature === publicConfigSignature.current) {
              return;
            }

            publicConfigSignature.current = nextSignature;
            setPublicConfig(body.dashboard);
          }
        })
        .catch(() => undefined);
    };

    loadPublicConfig();
    const interval = window.setInterval(loadPublicConfig, 10000);

    return () => {
      active = false;
      publicConfigSignature.current = "";
      window.clearInterval(interval);
    };
  }, [isPublicDashboard]);

  useEffect(() => {
    if (!isPublicDashboard) {
      return undefined;
    }

    let active = true;
    fetch("/api/native-chat/session", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: NativeChatSessionResponse | null) => {
        if (active && body?.identity) {
          setNativeIdentity(body.identity);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [isPublicDashboard]);

  const filteredMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return messages.filter((message) => {
      const platformAllowed = enabledPlatforms[message.platform];
      const queryAllowed =
        !normalizedQuery ||
        message.message.toLowerCase().includes(normalizedQuery) ||
        message.username.toLowerCase().includes(normalizedQuery) ||
        (message.displayName ?? "").toLowerCase().includes(normalizedQuery) ||
        (message.channelName ?? "").toLowerCase().includes(normalizedQuery) ||
        (message.sourceLabel ?? "").toLowerCase().includes(normalizedQuery);

      return platformAllowed && queryAllowed;
    });
  }, [enabledPlatforms, messages, query]);

  const liveVisibleMessages = isPublicDashboard ? messages : filteredMessages;
  const displayedMessages = lockedMessages ?? liveVisibleMessages;

  const statsSnapshot = useMemo(() => {
    const platformMessageCounts = Object.fromEntries(platformOrder.map((platform) => [platform, 0])) as Record<Platform, number>;
    const platformChatters = Object.fromEntries(platformOrder.map((platform) => [platform, new Set<string>()])) as Record<Platform, Set<string>>;
    const platformViewerCounts = Object.fromEntries(platformOrder.map((platform) => [platform, 0])) as Record<Platform, number>;
    const sourceRows = new Map<
      string,
      {
        id: string;
        platform: Platform;
        label: string;
        messageCount: number;
        chatters: Set<string>;
        viewerCount: number | null;
        status: string;
      }
    >();
    const chatterRows = new Map<
      string,
      {
        key: string;
        displayName: string;
        username: string;
        platform: Platform;
        count: number;
        sources: Set<string>;
      }
    >();
    const now = Date.now();
    const recentWindowMs = 5 * 60 * 1000;
    let recentMessageCount = 0;

    for (const source of sourceSnapshot.sources) {
      if (source.viewerCount !== null) {
        platformViewerCounts[source.platform] += source.viewerCount;
      }

      sourceRows.set(source.id, {
        id: source.id,
        platform: source.platform,
        label: source.label,
        messageCount: 0,
        chatters: new Set<string>(),
        viewerCount: source.viewerCount,
        status: source.status
      });
    }

    for (const message of messages) {
      platformMessageCounts[message.platform] += 1;
      const chatterKey = `${message.platform}:${message.platformUserId ?? message.username.toLowerCase()}`;
      const sourceLabel = displayBrandText(message.sourceLabel ?? message.channelName ?? platformLabels[message.platform]);
      const sourceId = message.sourceId ?? `${message.platform}:${sourceLabel.toLowerCase()}`;
      const displayName = message.displayName ?? message.username;
      platformChatters[message.platform].add(chatterKey);

      const sentAt = new Date(message.sentAt ?? message.receivedAt).getTime();
      if (!Number.isNaN(sentAt) && now - sentAt <= recentWindowMs) {
        recentMessageCount += 1;
      }

      const sourceRow =
        sourceRows.get(sourceId) ??
        {
          id: sourceId,
          platform: message.platform,
          label: sourceLabel,
          messageCount: 0,
          chatters: new Set<string>(),
          viewerCount: null,
          status: "connected"
        };
      sourceRow.messageCount += 1;
      sourceRow.chatters.add(chatterKey);
      sourceRows.set(sourceId, sourceRow);

      const chatterRow =
        chatterRows.get(chatterKey) ??
        {
          key: chatterKey,
          displayName,
          username: message.username,
          platform: message.platform,
          count: 0,
          sources: new Set<string>()
        };
      chatterRow.count += 1;
      chatterRow.sources.add(sourceLabel);
      chatterRows.set(chatterKey, chatterRow);
    }

    const totalMessages = messages.length;
    const uniqueChatters = new Set(Array.from(chatterRows.keys())).size;
    const totalKnownViewers = sourceSnapshot.totalKnownViewers;

    return {
      totalMessages,
      uniqueChatters,
      messagesPerMinute: recentMessageCount / 5,
      totalKnownViewers,
      unknownSourceCount: sourceSnapshot.unknownSourceCount,
      platformRows: platformOrder.map((platform) => ({
        platform,
        messageCount: platformMessageCounts[platform],
        messagePercent: totalMessages > 0 ? (platformMessageCounts[platform] / totalMessages) * 100 : 0,
        chatterCount: platformChatters[platform].size,
        viewerCount: platformViewerCounts[platform],
        viewerPercent: totalKnownViewers > 0 ? (platformViewerCounts[platform] / totalKnownViewers) * 100 : 0
      })),
      sourceRows: Array.from(sourceRows.values())
        .map((source) => ({
          ...source,
          chatterCount: source.chatters.size,
          messagePercent: totalMessages > 0 ? (source.messageCount / totalMessages) * 100 : 0,
          viewerPercent: totalKnownViewers > 0 && source.viewerCount !== null ? (source.viewerCount / totalKnownViewers) * 100 : 0
        }))
        .sort((left, right) => (right.viewerCount ?? 0) - (left.viewerCount ?? 0) || right.messageCount - left.messageCount),
      topChatters: Array.from(chatterRows.values())
        .sort((left, right) => right.count - left.count)
        .slice(0, 8)
        .map((chatter) => ({
          ...chatter,
          sourceCount: chatter.sources.size,
          sourceLabel: Array.from(chatter.sources).slice(0, 2).join(", ")
        }))
    };
  }, [messages, sourceSnapshot]);

  const betterTtvEmotesForMessage = useCallback(
    (message: ChatMessage): BetterTtvEmoteMap => {
      if (!chatPreferences.showEmotes || !chatPreferences.showBetterTtvEmotes || message.platform !== "twitch") {
        return {};
      }

      const channelEmotes = message.channelId ? betterTtvChannelEmotes[message.channelId] : undefined;
      return {
        ...betterTtvGlobalEmotes,
        ...(channelEmotes ?? {})
      };
    },
    [betterTtvChannelEmotes, betterTtvGlobalEmotes, chatPreferences.showBetterTtvEmotes, chatPreferences.showEmotes]
  );

  const streamSources = useMemo<StreamSource[]>(() => {
    const configuredSources = (publicConfig?.streamSources ?? [])
      .filter((source) => !isDevelopmentStreamSource(source))
      .map((source) => ({
        ...source,
        label: displayBrandText(source.label),
        detail: source.detail ? displayBrandText(source.detail) : source.detail
      }));
    if (configuredSources.length > 0) {
      return configuredSources;
    }

    if (publicConfig?.streamEmbedUrl || publicConfig?.streamWatchUrl) {
      return [
        {
          id: "legacy:primary",
          platform: null,
          label: "Primary Feed",
          embedUrl: publicConfig.streamEmbedUrl,
          watchUrl: publicConfig.streamWatchUrl ?? publicConfig.streamEmbedUrl,
          viewerCount: null,
          status: "connected",
          detail: publicConfig.description ? displayBrandText(publicConfig.description) : null,
          isPrimary: true
        }
      ];
    }

    return [];
  }, [publicConfig]);

  const activeStreamSource = useMemo(
    () => streamSources.find((source) => source.id === activeStreamSourceId) ?? streamSources[0] ?? null,
    [activeStreamSourceId, streamSources]
  );

  useEffect(() => {
    if (!isPublicDashboard || streamSources.length === 0) {
      return;
    }

    if (!activeStreamSourceId || !streamSources.some((source) => source.id === activeStreamSourceId)) {
      setActiveStreamSourceId(streamSources[0].id);
    }
  }, [activeStreamSourceId, isPublicDashboard, streamSources]);

  useEffect(() => {
    if (activeStreamSourceId) {
      window.localStorage.setItem("ls-chat-active-stream-source", activeStreamSourceId);
    }
  }, [activeStreamSourceId]);

  useEffect(() => {
    const previousIds = new Set(previousLiveMessageIds.current);
    const addedCount = liveVisibleMessages.reduce((count, message) => count + (previousIds.has(message.id) ? 0 : 1), 0);

    if (lockedMessages && addedCount > 0) {
      setNewMessagesAway((current) => current + addedCount);
    }

    if (!lockedMessages && atBottom && !readingLocked && !paused) {
      setNewMessagesAway(0);
    }

    previousLiveMessageIds.current = liveVisibleMessages.map((message) => message.id);
    previousVisibleMessageCount.current = liveVisibleMessages.length;
  }, [atBottom, liveVisibleMessages, lockedMessages, paused, readingLocked]);

  const lockChat = useCallback(
    (reason: "pause" | "scroll") => {
      readingLockedRef.current = reason === "scroll";
      setReadingLocked(reason === "scroll");
      setLockedMessages((current) => current ?? liveVisibleMessages);
      setAtBottom(false);
    },
    [liveVisibleMessages]
  );

  const releaseChatLock = useCallback(
    (behavior: "auto" | "smooth" = "auto", clearPaused = true) => {
      suppressScrollLockUntil.current = Date.now() + 1000;
      readingLockedRef.current = false;
      setReadingLocked(false);
      if (clearPaused) {
        setPaused(false);
      }
      setLockedMessages(null);
      setAtBottom(true);
      setNewMessagesAway(0);

      window.requestAnimationFrame(() => {
        if (liveVisibleMessages.length > 0) {
          virtuosoRef.current?.scrollToIndex({
            index: liveVisibleMessages.length - 1,
            align: "end",
            behavior
          });
        }
      });
    },
    [liveVisibleMessages.length]
  );

  const markUserScrollIntent = useCallback(() => {
    userScrollIntentUntil.current = Date.now() + 1200;
  }, []);

  const handleChatScroll = useCallback(
    (scrollTop: number) => {
      const previousScrollTop = lastScrollTop.current;
      const delta = scrollTop - previousScrollTop;
      lastScrollTop.current = scrollTop;
      const now = Date.now();
      const isUserScroll = now <= userScrollIntentUntil.current && now > suppressScrollLockUntil.current;

      if (delta < -1 && isUserScroll && !lockedMessages) {
        lockChat("scroll");
      }
    },
    [lockChat, lockedMessages]
  );

  const chatVirtuosoContext = useMemo(
    () => ({
      onScrollPositionChange: handleChatScroll,
      onUserScrollIntent: markUserScrollIntent
    }),
    [handleChatScroll, markUserScrollIntent]
  );

  function jumpToCurrent() {
    if (liveVisibleMessages.length === 0) {
      return;
    }

    releaseChatLock("smooth");
  }

  function togglePaused() {
    const nextPaused = !paused;

    if (nextPaused) {
      lockChat("pause");
    } else {
      releaseChatLock("auto", false);
    }

    setPaused(nextPaused);
  }

  async function sendMockMessage() {
    const text = mockText.trim();
    if (!text) {
      return;
    }

    await adminFetch("/api/mock/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: mockPlatform,
        username: "localtester",
        message: text
      })
    });
  }

  async function sendNativeMessage() {
    const text = nativeMessage.trim();
    if (!text) {
      return;
    }

    setNativeStatus("");
    const response = await fetch("/api/native-chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(
        nativeIdentity
          ? {
              message: text
            }
          : {
              clientId: nativeClientId,
              username: shortNativeClientId(nativeClientId),
              message: text
            }
      )
    });

    if (response.ok) {
      const body = (await response.json()) as { identity?: NativeChatIdentity };
      if (body.identity) {
        setNativeIdentity(body.identity);
      }
      setNativeMessage("");
      setNativeStatus("Sent");
      window.setTimeout(() => setNativeStatus(""), 1800);
      return;
    }

    setNativeStatus(await responseErrorMessage(response, "Message failed."));
  }

  async function hideNativeMessage(message: ChatMessage) {
    if (!isNativeMarketBubbleMessage(message)) {
      return;
    }

    setModerationStatus("Hiding native message...");
    setModeratingMessageIds((current) => new Set(current).add(message.id));

    const response = await adminFetch(`/api/native-chat/messages/${encodeURIComponent(message.id)}`, {
      method: "DELETE"
    });

    setModeratingMessageIds((current) => {
      const next = new Set(current);
      next.delete(message.id);
      return next;
    });

    if (response.ok) {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setLockedMessages((current) => (current ? current.filter((item) => item.id !== message.id) : current));
      setModerationStatus("Native message hidden.");
      return;
    }

    setModerationStatus(await responseErrorMessage(response, "Native moderation failed."));
  }

  async function muteNativeGuest(message: ChatMessage) {
    const userId = message.platformUserId;
    if (!isNativeMarketBubbleMessage(message) || !userId) {
      return;
    }

    setModerationStatus("Muting native guest...");
    setMutingNativeUserIds((current) => new Set(current).add(userId));

    const response = await adminFetch(`/api/native-chat/users/${encodeURIComponent(userId)}/mute`, {
      method: "POST"
    });

    setMutingNativeUserIds((current) => {
      const next = new Set(current);
      next.delete(userId);
      return next;
    });

    if (response.ok) {
      const keepMessage = (item: ChatMessage) => !isNativeMarketBubbleMessage(item) || item.platformUserId !== userId;
      setMessages((current) => current.filter(keepMessage));
      setLockedMessages((current) => (current ? current.filter(keepMessage) : current));
      setModerationStatus("Native guest muted for this session.");
      return;
    }

    setModerationStatus(await responseErrorMessage(response, "Native guest mute failed."));
  }

  function togglePlatform(platform: Platform) {
    setEnabledPlatforms((current) => ({
      ...current,
      [platform]: !current[platform]
    }));
  }

  function setMessageStyle(messageStyle: MessageStyle) {
    setChatPreferences((current) => ({ ...current, messageStyle }));
  }

  function setMessagePreference(key: keyof Omit<ChatPreferences, "messageStyle">, value: boolean) {
    setChatPreferences((current) => ({ ...current, [key]: value }));
  }

  function resetChatPreferences() {
    setChatPreferences({ ...defaultChatPreferences });
  }

  function cycleStreamSource(direction: -1 | 1) {
    if (streamSources.length === 0) {
      return;
    }

    const currentIndex = Math.max(
      0,
      streamSources.findIndex((source) => source.id === activeStreamSource?.id)
    );
    const nextIndex = (currentIndex + direction + streamSources.length) % streamSources.length;
    setActiveStreamSourceId(streamSources[nextIndex].id);
    setStreamSourceMenuOpen(false);
  }

  function selectStreamSource(sourceId: string) {
    setActiveStreamSourceId(sourceId);
    setStreamSourceMenuOpen(false);
  }

  function reloadStreamFrame() {
    setStreamFrameRefreshKey((current) => current + 1);
  }

  function updateTwitchBroadcasterLogin(value: string) {
    twitchBroadcasterEdited.current = true;
    setBroadcasterLogin(value);
  }

  function updateKickBroadcaster(value: string) {
    kickBroadcasterEdited.current = true;
    setKickBroadcaster(value);
  }

  function updateXTargetAccount(value: string) {
    xTargetAccountEdited.current = true;
    setXTargetAccount(value);
  }

  function updateXRules(value: string) {
    xRulesEdited.current = true;
    setXRules(value);
  }

  function markLiveSessionEdited() {
    liveSessionEdited.current = true;
  }

  function markRuntimeConfigEdited() {
    runtimeConfigEdited.current = true;
  }

  function cycleSettingsPlatform(direction: -1 | 1) {
    setActiveSettingsPlatform((current) => {
      const currentIndex = settingsPlatformOrder.indexOf(current);
      const nextIndex = (currentIndex + direction + settingsPlatformOrder.length) % settingsPlatformOrder.length;
      return settingsPlatformOrder[nextIndex];
    });
  }

  async function switchTwitchBroadcaster() {
    const login = broadcasterLogin.trim();
    if (!login) {
      return;
    }

    setSettingsMessage("Tracking Twitch broadcaster...");
    const response = await adminFetch("/api/integrations/twitch/broadcaster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login })
    });

    if (!response.ok) {
      setSettingsMessage(await responseErrorMessage(response, "Twitch broadcaster track failed."));
      await loadHealth();
      return;
    }

    setSettingsMessage("Twitch broadcaster tracked.");
    await loadHealth();
  }

  async function restartTwitch() {
    setSettingsMessage("Restarting Twitch...");
    const response = await adminFetch("/api/integrations/twitch/restart", { method: "POST" });
    setSettingsMessage(response.ok ? "Twitch restart requested." : "Twitch restart failed.");
    await loadHealth();
  }

  async function removeTwitchTarget(target: string) {
    setSettingsMessage("Removing Twitch target...");
    const response = await adminFetch(`/api/integrations/twitch/targets/${encodeURIComponent(target)}`, { method: "DELETE" });
    setSettingsMessage(response.ok ? "Twitch target removed." : await responseErrorMessage(response, "Twitch target remove failed."));
    await loadHealth();
  }

  async function disconnectTwitch() {
    setSettingsMessage("Disconnecting Twitch...");
    const response = await adminFetch("/api/integrations/twitch/disconnect", { method: "POST" });
    setSettingsMessage(response.ok ? "Twitch disconnected." : "Twitch disconnect failed.");
    await loadHealth();
  }

  async function subscribeKick() {
    const broadcaster = normalizeAccountName(kickBroadcaster);
    setSettingsMessage("Subscribing Kick webhook...");
    const response = await adminFetch("/api/integrations/kick/subscribe-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(broadcaster ? { broadcaster } : {})
    });
    setSettingsMessage(response.ok ? "Kick subscription requested." : await responseErrorMessage(response, "Kick subscription failed."));
    await loadHealth();
  }

  async function restartKick() {
    setSettingsMessage("Refreshing Kick subscription...");
    const response = await adminFetch("/api/integrations/kick/restart", { method: "POST" });
    setSettingsMessage(response.ok ? "Kick subscription refreshed." : "Kick refresh failed.");
    await loadHealth();
  }

  async function removeKickTarget(target: string) {
    setSettingsMessage("Removing Kick target...");
    const response = await adminFetch(`/api/integrations/kick/targets/${encodeURIComponent(target)}`, { method: "DELETE" });
    setSettingsMessage(response.ok ? "Kick target removed." : await responseErrorMessage(response, "Kick target remove failed."));
    await loadHealth();
  }

  async function disconnectKick() {
    setSettingsMessage("Disconnecting Kick...");
    const response = await adminFetch("/api/integrations/kick/disconnect", { method: "POST" });
    setSettingsMessage(response.ok ? "Kick disconnected." : "Kick disconnect failed.");
    await loadHealth();
  }

  async function saveXRules(nextRules = xRules) {
    const rules = nextRules.trim();
    setSettingsMessage("Saving X rules...");
    const response = await adminFetch("/api/integrations/x/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules })
    });
    if (response.ok) {
      setXRules(rules);
    }
    setSettingsMessage(response.ok ? "X rules saved." : "X rules failed.");
    await loadHealth();
  }

  async function switchXTargetAccount() {
    const rules = xAccountRules(xTargetAccount);
    if (!rules) {
      return;
    }

    await saveXRules(rules);
    setSettingsMessage("X target saved.");
  }

  async function restartX() {
    setSettingsMessage("Restarting X stream...");
    const response = await adminFetch("/api/integrations/x/restart", { method: "POST" });
    setSettingsMessage(response.ok ? "X restart requested." : "X restart failed.");
    await loadHealth();
  }

  async function stopX() {
    setSettingsMessage("Stopping X stream...");
    const response = await adminFetch("/api/integrations/x/stop", { method: "POST" });
    setSettingsMessage(response.ok ? "X stream stopped." : "X stop failed.");
    await loadHealth();
  }

  async function startConfiguredXLiveWorkers() {
    if (configuredXLiveSources.length === 0) {
      setXConnectStatus("Add at least one X target before starting capture.");
      setSettingsMessage("Add at least one X target before starting capture.");
      return;
    }

    setXConnectStatus("Starting X capture workers...");
    let started = 0;
    let lastFailure = "";
    for (const source of configuredXLiveSources) {
      const response = await adminFetch("/api/integrations/x/livechat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.url, channelName: `${source.label} livechat` })
      });

      if (response.ok) {
        started += 1;
      } else {
        lastFailure = await responseErrorMessage(response, "X worker failed.");
      }
    }

    const message =
      started === configuredXLiveSources.length
        ? `Started ${started} X livechat worker${started === 1 ? "" : "s"}.`
        : `Started ${started}/${configuredXLiveSources.length} X workers. ${lastFailure}`;
    setXConnectStatus(message.trim());
    setSettingsMessage(message.trim());
    await loadHealth();
  }

  async function stopXLiveChat() {
    setSettingsMessage("Stopping X live chat capture...");
    const response = await adminFetch("/api/integrations/x/livechat/stop", { method: "POST" });
    setSettingsMessage(response.ok ? "X live chat capture stopped." : "X live chat stop failed.");
    await loadHealth();
  }

  async function saveLiveSession() {
    setSettingsMessage("Saving live session...");
    const response = await adminFetch("/api/live-session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: sessionTitle.trim(),
        nativeChatLabel: sessionNativeChatLabel.trim(),
        streamLabel: sessionStreamLabel.trim() || null,
        streamEmbedUrl: sessionStreamEmbedUrl.trim() || null,
        streamWatchUrl: sessionStreamWatchUrl.trim() || null,
        description: sessionDescription.trim()
      })
    });

    if (!response.ok) {
      setSettingsMessage(await responseErrorMessage(response, "Live session save failed."));
      return;
    }

    liveSessionEdited.current = false;
    setSettingsMessage("Live session saved.");
    await loadHealth();
  }

  async function saveRuntimeConfig() {
    const messageLimit = parseIntegerInput(runtimeMessageHistoryLimit);
    const viewerPollSeconds = parseIntegerInput(runtimeViewerPollSeconds);
    const nativeRateLimit = parseIntegerInput(runtimeNativeRateLimit);
    const nativeRateWindowSeconds = parseIntegerInput(runtimeNativeRateWindowSeconds);

    if (
      messageLimit === null ||
      viewerPollSeconds === null ||
      nativeRateLimit === null ||
      nativeRateWindowSeconds === null
    ) {
      setSettingsMessage("Advanced runtime settings must be whole numbers.");
      return;
    }

    if (messageLimit < 50 || messageLimit > 5000) {
      setSettingsMessage("Message limit must be between 50 and 5000.");
      return;
    }

    if (viewerPollSeconds < 5 || viewerPollSeconds > 300) {
      setSettingsMessage("Viewer poll must be between 5 and 300 seconds.");
      return;
    }

    if (nativeRateLimit < 1 || nativeRateLimit > 120) {
      setSettingsMessage("Native chat rate limit must be between 1 and 120 messages.");
      return;
    }

    if (nativeRateWindowSeconds < 1 || nativeRateWindowSeconds > 300) {
      setSettingsMessage("Native chat rate window must be between 1 and 300 seconds.");
      return;
    }

    setSettingsMessage("Saving advanced runtime settings...");
    const response = await adminFetch("/api/runtime-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageHistoryLimit: messageLimit,
        viewerPollMs: viewerPollSeconds * 1000,
        nativeChatRateLimit: nativeRateLimit,
        nativeChatRateWindowMs: nativeRateWindowSeconds * 1000
      })
    });

    if (!response.ok) {
      setSettingsMessage(await responseErrorMessage(response, "Advanced settings save failed."));
      return;
    }

    runtimeConfigEdited.current = false;
    setSettingsMessage("Advanced runtime settings saved.");
    await loadHealth();
  }

  async function removeXLiveChatTarget(targetId: string) {
    setSettingsMessage("Stopping X live chat target...");
    const response = await adminFetch(`/api/integrations/x/livechat/targets/${encodeURIComponent(targetId)}`, { method: "DELETE" });
    setSettingsMessage(response.ok ? "X live chat target stopped." : await responseErrorMessage(response, "X target stop failed."));
    await loadHealth();
  }

  async function submitOperatorLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOperatorAuthSubmitting(true);
    setOperatorAuthMessage("Checking operator access...");

    try {
      const response = await fetch("/api/operator-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: operatorPassword })
      });

      if (!response.ok) {
        setOperatorAuthMessage(await responseErrorMessage(response, "Operator login failed."));
        return;
      }

      setOperatorAuth((await response.json()) as OperatorAuthStatus);
      setOperatorPassword("");
      setOperatorAuthMessage("");
      await loadHealth();
    } catch {
      setOperatorAuthMessage("Operator login failed.");
    } finally {
      setOperatorAuthSubmitting(false);
    }
  }

  async function logoutOperator() {
    await fetch("/api/operator-auth/logout", {
      method: "POST",
      credentials: "same-origin"
    }).catch(() => undefined);

    setHealth(null);
    setSettingsOpen(false);
    setStatsOpen(false);
    setInstallOpen(false);
    setAdminActionsOpen(false);
    setOperatorAuth({ required: true, authenticated: false, csrfToken: null, publicOnlyMode: false });
  }

  const twitchStatus = health?.integrations.statuses.twitch;
  const kickStatus = health?.integrations.statuses.kick;
  const xStatus = health?.integrations.statuses.x;
  const kickCredentials = health?.integrations.kick.credentialsPresent;
  const kickAuthorizationMode = health?.integrations.kick.authorizationMode ?? "missing";
  const kickAuthorizationLabel =
    kickAuthorizationMode === "oauth"
      ? "OAuth session stored"
      : kickAuthorizationMode === "app"
        ? "App credentials ready for env auto-subscribe"
        : kickAuthorizationMode === "manual-token"
          ? "Manual token ready for env auto-subscribe"
          : "Authorization missing";
  const kickSubscribeTitle =
    health?.integrations.kick.canSubscribe === false
      ? "Connect Kick OAuth before subscribing from the dashboard"
      : "Subscribe Kick webhook with stored OAuth";
  const xRuleCount = health?.integrations.x.rules?.length ?? 0;
  const activeXLiveTargets = health?.integrations.x.liveChatCapture?.activeTargets ?? [];
  const configuredXLiveSources = useMemo(
    () =>
      uniqueXLiveChatSources([
        ...xLiveChatInputsFromRules(xRules || health?.integrations.x.rawRules),
        ...(health?.integrations.x.liveChatCapture?.startupTargets ?? []),
        xTargetAccount
      ]),
    [health?.integrations.x.liveChatCapture?.startupTargets, health?.integrations.x.rawRules, xRules, xTargetAccount]
  );
  const nativeIdentityLabel = nativeIdentity?.displayName ?? shortNativeClientId(nativeClientId);
  const nativeIdentityTitle = nativeIdentity
    ? `Market Bubble guest session: ${nativeIdentity.clientId}`
    : `Local Market Bubble chat ID: ${nativeClientId}`;
  const dashboardInstallConfig = health?.publicDashboard;
  const installEmbedUrl = dashboardInstallConfig?.fullEmbedUrl ?? dashboardInstallConfig?.embedUrl ?? "/embed";
  const installChatEmbedUrl = dashboardInstallConfig?.chatEmbedUrl ?? appendQueryParam(installEmbedUrl, "view", "chat");
  const installMockUrl =
    dashboardInstallConfig?.mockPageUrl ??
    (dashboardInstallConfig?.embedUrl ? dashboardInstallConfig.embedUrl.replace(/\/embed(?:\?.*)?$/, "/mock-marketbubble") : "/mock-marketbubble");
  const installConfigUrl = dashboardInstallConfig?.publicConfigUrl ?? "/api/public/config";
  const fullEmbedSnippet = iframeSnippet({
    src: installEmbedUrl,
    title: "Market Bubble Live",
    height: 760,
    allowMedia: true
  });
  const chatOnlyEmbedSnippet = iframeSnippet({
    src: installChatEmbedUrl,
    title: "Market Bubble Shared Chat",
    height: 640
  });
  const readinessItems = installReadinessItems(health);
  const readinessReadyCount = readinessItems.filter((item) => item.ready).length;
  const demoItems = demoRunbookItems({
    publicUrl: dashboardInstallConfig?.publicUrl ?? "/live",
    embedUrl: installEmbedUrl,
    chatEmbedUrl: installChatEmbedUrl,
    proofUrl: installMockUrl,
    readinessItems,
    hasNativeMutes: (health?.configuration.nativeModeration?.mutedUserCount ?? 0) > 0
  });
  const demoReadyCount = demoItems.filter((item) => item.ready).length;
  const preferencesPanel = preferencesOpen ? (
    <PreferencesPanel
      presentation={isPublicDashboard ? "sheet" : "modal"}
      preferences={chatPreferences}
      visualPreset={visualPreset}
      onClose={() => setPreferencesOpen(false)}
      onReset={resetChatPreferences}
      onSetMessageStyle={setMessageStyle}
      onSetPreference={setMessagePreference}
      onSetVisualPreset={setVisualPreset}
    />
  ) : null;
  const xConnectPanel = xConnectOpen ? (
    <XConnectPanel
      sources={configuredXLiveSources}
      activeTargets={activeXLiveTargets}
      status={xConnectStatus || xStatus?.detail || ""}
      bridgePath={health?.integrations.x.liveCapture?.scriptPath ?? "/x-live-capture.js"}
      tokenRequired={Boolean(health?.integrations.x.liveCapture?.tokenRequired)}
      chromeFound={Boolean(health?.integrations.x.liveChatCapture?.chromeFound)}
      workerRunning={Boolean(health?.integrations.x.liveChatCapture?.running)}
      workerAutoStart={Boolean(health?.integrations.x.liveChatCapture?.workerAutoStart)}
      onClose={() => setXConnectOpen(false)}
      onStartWorkers={() => void startConfiguredXLiveWorkers()}
      onStopWorkers={() => void stopXLiveChat()}
      onStopTarget={(targetId) => void removeXLiveChatTarget(targetId)}
    />
  ) : null;

  if (isMarketBubbleMockPage) {
    return <MarketBubbleMockPage />;
  }

  if (isAdminDashboard && operatorAuth?.required && !operatorAuth.authenticated) {
    return (
      <OperatorLoginPage
        password={operatorPassword}
        message={operatorAuthMessage}
        submitting={operatorAuthSubmitting}
        onPasswordChange={setOperatorPassword}
        onSubmit={(event) => void submitOperatorLogin(event)}
      />
    );
  }

  if (isAdminDashboard && operatorAuth === null) {
    return (
      <main className="operator-login-shell">
        <section className="operator-login-card" aria-live="polite">
          <div className="operator-login-mark">
            <Radio size={18} aria-hidden="true" />
          </div>
          <div className="operator-login-copy">
            <span>Operator Access</span>
            <h1>Market Bubble Live Desk</h1>
            <p>Checking admin access...</p>
          </div>
        </section>
      </main>
    );
  }

  if (isPublicDashboard) {
    const dashboardTitle = displayBrandText(publicConfig?.title ?? "Market Bubble Live");
    const dashboardDescription = publicConfig?.description ? displayBrandText(publicConfig.description) : "";
    const streamEmbedUrl = activeStreamSource?.embedUrl ?? publicConfig?.streamEmbedUrl ?? null;
    const streamWatchUrl =
      activeStreamSource?.watchUrl ??
      publicConfig?.streamWatchUrl ??
      sourceSnapshot.sources.find((source) => source.status === "live" && source.sourceUrl)?.sourceUrl ??
      null;
    const activeStreamMeta = activeStreamSource ? streamSourceMeta(activeStreamSource) : "Feed unavailable";

    return (
      <main className={`public-shell ${isEmbeddedDashboard ? "embed-shell" : ""} ${isChatOnlyEmbed ? "embed-shell-chat-only" : ""}`}>
        {preferencesPanel}
        <header className="public-header">
          <div className="public-brand">
            <Radio size={16} aria-hidden="true" />
            <div>
              <h1>{dashboardTitle}</h1>
              {dashboardDescription ? <span>{dashboardDescription}</span> : null}
            </div>
          </div>
          <div className="public-header-actions">
            <button
              className={`icon-button ${preferencesOpen ? "icon-button-active" : ""}`}
              type="button"
              title="Preferences"
              aria-label="Preferences"
              aria-pressed={preferencesOpen}
              onClick={() => setPreferencesOpen((value) => !value)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
            </button>
            <ViewerSummary snapshot={sourceSnapshot} />
            <ConnectionPill state={connectionState} />
          </div>
        </header>

        <section className={`public-live-grid ${isChatOnlyEmbed ? "public-live-grid-chat-only" : ""}`}>
          {!isChatOnlyEmbed ? (
          <section className="stream-stage" aria-label="Live stream">
            {streamSources.length > 0 ? (
              <div className="stream-source-console">
                <div className="stream-now">
                  {activeStreamSource ? <StreamSourceMark source={activeStreamSource} /> : null}
                  <div>
                    <span>Watching</span>
                    <strong>{activeStreamSource?.label ?? "Primary Feed"}</strong>
                  </div>
                  <em>{activeStreamMeta}</em>
                </div>
                <div className={`stream-source-controls ${streamSourceMenuOpen ? "stream-source-controls-menu-open" : ""}`}>
                  <div
                    className={`stream-source-select-wrap ${streamSourceMenuOpen ? "stream-source-select-open" : ""}`}
                    onBlur={(event) => {
                      const nextFocus = event.relatedTarget;
                      if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                        setStreamSourceMenuOpen(false);
                      }
                    }}
                  >
                    <button
                      className="stream-source-select-button"
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={streamSourceMenuOpen}
                      onClick={() => setStreamSourceMenuOpen((open) => !open)}
                    >
                      <span className="stream-source-select-label">
                        {activeStreamSource ? <StreamSourceMark source={activeStreamSource} /> : null}
                        <span>Source</span>
                      </span>
                      <span className="stream-source-selected">
                        <strong>{activeStreamSource?.label ?? "Select source"}</strong>
                        <span>{activeStreamMeta}</span>
                      </span>
                      <ChevronDown className="stream-source-select-chevron" size={16} aria-hidden="true" />
                    </button>
                    {streamSourceMenuOpen ? (
                      <div className="stream-source-menu" role="listbox" aria-label="Stream source">
                        {streamSources.map((source) => (
                          <button
                            className={`stream-source-option ${source.id === activeStreamSource?.id ? "stream-source-option-active" : ""}`}
                            type="button"
                            role="option"
                            aria-selected={source.id === activeStreamSource?.id}
                            key={source.id}
                            onClick={() => selectStreamSource(source.id)}
                          >
                            <StreamSourceMark source={source} />
                            <span className="stream-source-option-body">
                              <span>
                                <strong>{source.label}</strong>
                                <em>{streamSourceMeta(source)}</em>
                              </span>
                              <span className="stream-source-option-meta">
                                {source.isPrimary ? <span>Primary</span> : null}
                                <span>{source.platform ? platformLabels[source.platform] : "Market Bubble"}</span>
                                {source.id === activeStreamSource?.id ? (
                                  <span className="stream-source-option-selected">
                                    <Check size={12} aria-hidden="true" />
                                    Selected
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button className="icon-button stream-source-nav-button" type="button" title="Previous stream source" onClick={() => cycleStreamSource(-1)}>
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <div className="stream-source-tabs" role="tablist" aria-label="Stream sources">
                    {streamSources.map((source) => (
                      <button
                        className={`stream-source-tab ${source.id === activeStreamSource?.id ? "stream-source-tab-active" : ""}`}
                        type="button"
                        role="tab"
                        aria-selected={source.id === activeStreamSource?.id}
                        title={`${source.label} / ${streamSourceMeta(source)}`}
                        key={source.id}
                        onClick={() => setActiveStreamSourceId(source.id)}
                      >
                        <StreamSourceMark source={source} />
                        <span>{source.label}</span>
                      </button>
                    ))}
                  </div>
                  <button className="icon-button stream-source-nav-button" type="button" title="Next stream source" onClick={() => cycleStreamSource(1)}>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                  <button className="icon-button" type="button" title="Reload stream player" onClick={reloadStreamFrame}>
                    <RefreshCw size={16} aria-hidden="true" />
                  </button>
                  {streamWatchUrl ? (
                    <a className="icon-button stream-open-button" href={streamWatchUrl} target="_blank" rel="noreferrer" title="Open stream source">
                      <ExternalLink size={16} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="stream-frame">
              {streamEmbedUrl ? (
                <StreamEmbedFrame src={streamEmbedUrl} title={dashboardTitle} refreshKey={streamFrameRefreshKey} />
              ) : (
                <div className="stream-placeholder">
                  <Radio size={30} aria-hidden="true" />
                  <strong>{activeStreamSource?.label ?? dashboardTitle}</strong>
                  {streamWatchUrl ? (
                    <a className="stream-link" href={streamWatchUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} aria-hidden="true" />
                      Open stream
                    </a>
                  ) : (
                    <span>Stream embed unavailable</span>
                  )}
                </div>
              )}
            </div>
          </section>
          ) : null}

          <section className="public-chat-panel" aria-label="Combined live chat">
            <div className="public-chat-header">
              <div>
                <MessageCircle size={16} aria-hidden="true" />
                <strong>Shared Chat</strong>
              </div>
              <span>{messages.length} messages</span>
            </div>
            <div className="public-message-list">
              <Virtuoso
                ref={virtuosoRef}
                data={displayedMessages}
                components={virtuosoComponents}
                context={chatVirtuosoContext}
                atBottomThreshold={72}
                atBottomStateChange={(bottom) => {
                  if (bottom && !lockedMessages && !paused) {
                    setAtBottom(true);
                    readingLockedRef.current = false;
                    setReadingLocked(false);
                    setNewMessagesAway(0);
                  } else if (lockedMessages || readingLockedRef.current || paused) {
                    setAtBottom(false);
                  }
                }}
                followOutput={lockedMessages || paused || readingLocked ? false : "auto"}
                itemContent={(_, message) => (
                  <MessageRow message={message} preferences={chatPreferences} betterTtvEmotes={betterTtvEmotesForMessage(message)} />
                )}
              />
              {lockedMessages && displayedMessages.length > 0 ? (
                <button className="jump-current-button public-jump-current-button" type="button" onClick={jumpToCurrent}>
                  <ArrowDown size={15} aria-hidden="true" />
                  {newMessagesAway > 0 ? `${newMessagesAway} new` : "Jump to current"}
                </button>
              ) : null}
            </div>
            <form
              className="native-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendNativeMessage();
              }}
            >
              <span className="native-identity-chip" title={nativeIdentityTitle}>
                {nativeIdentityLabel}
              </span>
              <input
                className="native-message-input"
                value={nativeMessage}
                onChange={(event) => setNativeMessage(event.target.value)}
                aria-label="Native chat message"
                placeholder="Chat on Market Bubble"
                maxLength={500}
              />
              <button className="primary-button" type="submit">
                <Send size={15} aria-hidden="true" />
                Send
              </button>
              {nativeStatus ? <span className="native-status">{nativeStatus}</span> : null}
            </form>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {preferencesPanel}
      {xConnectPanel}
      <section className={`chat-shell ${settingsOpen || statsOpen || installOpen ? "chat-shell-settings-open" : ""}`}>
        <header className="chat-header">
          <div className="chat-title">
            <div className="chat-title-row">
              <Radio size={16} aria-hidden="true" />
              <h1>Market Bubble Live Desk</h1>
            </div>
            <span>
              {filteredMessages.length} shown | {counts.total} total
            </span>
          </div>

          <div className="source-bar" aria-label="Platform filters">
            {platformOrder.map((platform) => (
              <button
                className={`source-chip source-chip-${platform} ${enabledPlatforms[platform] ? "source-chip-active" : ""}`}
                type="button"
                key={platform}
                title={`Toggle ${platformLabels[platform]}`}
                aria-pressed={enabledPlatforms[platform]}
                onClick={() => togglePlatform(platform)}
              >
                <PlatformBadge platform={platform} />
                <IntegrationDot state={health?.integrations.statuses[platform]?.state} />
                <span>{counts[platform]}</span>
              </button>
            ))}
          </div>

          <div className="header-actions">
            <label className="search-box">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
              {query ? (
                <button className="ghost-icon" type="button" title="Clear search" onClick={() => setQuery("")}>
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="admin-actions-inline">
              <ViewerSummary snapshot={sourceSnapshot} />
              <ConnectionPill state={connectionState} />
              <button
                className={`icon-button ${preferencesOpen ? "icon-button-active" : ""}`}
                type="button"
                title="Preferences"
                aria-label="Preferences"
                aria-pressed={preferencesOpen}
                onClick={() => setPreferencesOpen((value) => !value)}
              >
                <SlidersHorizontal size={17} aria-hidden="true" />
              </button>
              <button
                className={`icon-button ${paused ? "icon-button-active" : ""}`}
                type="button"
                title={paused ? "Resume feed" : "Pause feed"}
                aria-label={paused ? "Resume feed" : "Pause feed"}
                aria-pressed={paused}
                onClick={togglePaused}
              >
                {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
              </button>
              <button
                className={`icon-button ${statsOpen ? "icon-button-active" : ""}`}
                type="button"
                title="Stats dashboard"
                aria-label="Stats dashboard"
                aria-pressed={statsOpen}
                onClick={() => {
                  setStatsOpen((value) => !value);
                  setSettingsOpen(false);
                  setInstallOpen(false);
                }}
              >
                <BarChart3 size={17} aria-hidden="true" />
              </button>
              <button
                className={`icon-button ${installOpen ? "icon-button-active" : ""}`}
                type="button"
                title="Website install"
                aria-label="Website install"
                aria-pressed={installOpen}
                onClick={() => {
                  setInstallOpen((value) => !value);
                  setSettingsOpen(false);
                  setStatsOpen(false);
                }}
              >
                <ExternalLink size={17} aria-hidden="true" />
              </button>
              <button
                className={`icon-button ${settingsOpen ? "icon-button-active" : ""}`}
                type="button"
                title="Source settings"
                aria-label="Source settings"
                aria-pressed={settingsOpen}
                onClick={() => {
                  setSettingsOpen((value) => !value);
                  setStatsOpen(false);
                  setInstallOpen(false);
                }}
              >
                <Settings size={17} aria-hidden="true" />
              </button>
            </div>
            <div
              className="admin-actions-menu-wrap"
              onBlur={(event) => {
                const nextFocus = event.relatedTarget;
                if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                  setAdminActionsOpen(false);
                }
              }}
            >
              <button
                className={`icon-button admin-actions-menu-trigger ${adminActionsOpen ? "icon-button-active" : ""}`}
                type="button"
                title="More admin actions"
                aria-label="More admin actions"
                aria-expanded={adminActionsOpen}
                onClick={() => setAdminActionsOpen((open) => !open)}
              >
                <MoreHorizontal size={17} aria-hidden="true" />
              </button>
              {adminActionsOpen ? (
                <div className="admin-actions-menu" role="menu">
                  <div className="admin-menu-status">
                    <ViewerSummary snapshot={sourceSnapshot} />
                    <ConnectionPill state={connectionState} />
                  </div>
                  <button
                    className="admin-menu-action"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPreferencesOpen((value) => !value);
                      setAdminActionsOpen(false);
                    }}
                  >
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    <span>Preferences</span>
                  </button>
                  <button className="admin-menu-action" type="button" role="menuitem" onClick={togglePaused}>
                    {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                    <span>{paused ? "Resume Feed" : "Pause Feed"}</span>
                  </button>
                  <button
                    className="admin-menu-action"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setStatsOpen((value) => !value);
                      setSettingsOpen(false);
                      setInstallOpen(false);
                      setAdminActionsOpen(false);
                    }}
                  >
                    <BarChart3 size={16} aria-hidden="true" />
                    <span>Stats</span>
                  </button>
                  <button
                    className="admin-menu-action"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setInstallOpen((value) => !value);
                      setSettingsOpen(false);
                      setStatsOpen(false);
                      setAdminActionsOpen(false);
                    }}
                  >
                    <ExternalLink size={16} aria-hidden="true" />
                    <span>Website Install</span>
                  </button>
                  <button
                    className="admin-menu-action"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSettingsOpen((value) => !value);
                      setStatsOpen(false);
                      setInstallOpen(false);
                      setAdminActionsOpen(false);
                    }}
                  >
                    <Settings size={16} aria-hidden="true" />
                    <span>Source Settings</span>
                  </button>
                  {operatorAuth?.required ? (
                    <button className="admin-menu-action admin-menu-action-danger" type="button" role="menuitem" onClick={() => void logoutOperator()}>
                      <LogOut size={16} aria-hidden="true" />
                      <span>Sign Out</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {settingsOpen ? (
          <section className="settings-page" aria-label="Source settings">
            <div className="settings-page-header">
              <div className="settings-page-title">
                <Settings size={18} aria-hidden="true" />
                <div>
                  <h2>Source Settings</h2>
                  <span>Market Bubble site and platform connections</span>
                </div>
              </div>
            </div>

            <div className={`settings-platform-panel settings-platform-${activeSettingsPlatform}`}>
              <div className="settings-category-heading">
                <div>
                  <Radio size={15} aria-hidden="true" />
                  <strong>Market Bubble Site</strong>
                </div>
                <span>Public dashboard, native chat room, and stream defaults</span>
              </div>
              <div className="settings-section settings-session-section">
                <div className="settings-heading">
                  <Radio size={15} aria-hidden="true" />
                  <strong>Live Session</strong>
                  <span className="settings-status-label">Public</span>
                </div>
                <div className="settings-control-row">
                  <label>
                    <span>Dashboard Title</span>
                    <input
                      value={sessionTitle}
                      onChange={(event) => {
                        markLiveSessionEdited();
                        setSessionTitle(event.target.value);
                      }}
                      placeholder="Market Bubble Live"
                    />
                  </label>
                  <label>
                    <span>Native Chat Label</span>
                    <input
                      value={sessionNativeChatLabel}
                      onChange={(event) => {
                        markLiveSessionEdited();
                        setSessionNativeChatLabel(event.target.value);
                      }}
                      placeholder="Market Bubble"
                    />
                  </label>
                  <label>
                    <span>Primary Stream Label</span>
                    <input
                      value={sessionStreamLabel}
                      onChange={(event) => {
                        markLiveSessionEdited();
                        setSessionStreamLabel(event.target.value);
                      }}
                      placeholder="Banks"
                    />
                  </label>
                  <div className="settings-actions">
                    <button className="secondary-button" type="button" title="Save live session" onClick={() => void saveLiveSession()}>
                      <RefreshCw size={15} aria-hidden="true" />
                      Save
                    </button>
                    <a className="secondary-link-button" href="/live" target="_blank" rel="noreferrer" title="Open public dashboard">
                      <ExternalLink size={15} aria-hidden="true" />
                      View
                    </a>
                  </div>
                </div>
                <div className="settings-control-row settings-control-row-full">
                  <label>
                    <span>Stream / Embed URL</span>
                    <input
                      value={sessionStreamEmbedUrl}
                      onChange={(event) => {
                        markLiveSessionEdited();
                        setSessionStreamEmbedUrl(event.target.value);
                      }}
                      placeholder="https://www.twitch.tv/jynxzi"
                    />
                  </label>
                </div>
                <div className="settings-control-row settings-control-row-full">
                  <label>
                    <span>Public Watch URL</span>
                    <input
                      value={sessionStreamWatchUrl}
                      onChange={(event) => {
                        markLiveSessionEdited();
                        setSessionStreamWatchUrl(event.target.value);
                      }}
                      placeholder="https://marketbubble.com/live"
                    />
                  </label>
                </div>
                <div className="settings-control-row settings-control-row-full">
                  <label>
                    <span>Description</span>
                    <input
                      value={sessionDescription}
                      onChange={(event) => {
                        markLiveSessionEdited();
                        setSessionDescription(event.target.value);
                      }}
                      placeholder="Short public session note"
                    />
                  </label>
                </div>
                <div className="settings-meta">
                  <span>{health?.publicDashboard.publicUrl ?? "/live"}</span>
                  <span>{sourceSnapshot.totalKnownViewers} known viewers</span>
                  <span>{sourceSnapshot.unknownSourceCount} unknown-count sources</span>
                </div>
              </div>

              <div className="settings-category-heading settings-platform-category-heading">
                <div>
                  <Settings size={15} aria-hidden="true" />
                  <strong>Platform Connections</strong>
                </div>
                <div className="settings-platform-switcher">
                  <button className="icon-button settings-nav-button" type="button" title="Previous platform" onClick={() => cycleSettingsPlatform(-1)}>
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <div
                    className={`settings-platform-select-wrap ${settingsPlatformMenuOpen ? "settings-platform-select-open" : ""}`}
                    onBlur={(event) => {
                      const nextFocus = event.relatedTarget;
                      if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                        setSettingsPlatformMenuOpen(false);
                      }
                    }}
                  >
                    <button
                      className="settings-platform-select-button"
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={settingsPlatformMenuOpen}
                      onClick={() => setSettingsPlatformMenuOpen((open) => !open)}
                    >
                      <PlatformBadge platform={activeSettingsPlatform} />
                      <span>
                        <em>Platform</em>
                        <strong>{platformLabels[activeSettingsPlatform]}</strong>
                      </span>
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                    {settingsPlatformMenuOpen ? (
                      <div className="settings-platform-menu" role="listbox" aria-label="Settings platform">
                        {settingsPlatformOrder.map((platform) => (
                          <button
                            className={`settings-platform-option ${activeSettingsPlatform === platform ? "settings-platform-option-active" : ""}`}
                            type="button"
                            role="option"
                            aria-selected={activeSettingsPlatform === platform}
                            key={platform}
                            onClick={() => {
                              setActiveSettingsPlatform(platform);
                              setSettingsPlatformMenuOpen(false);
                            }}
                          >
                            <PlatformBadge platform={platform} />
                            <span className="settings-platform-option-body">
                              <span>
                                <strong>{platformLabels[platform]}</strong>
                                <em>{health?.integrations.statuses[platform]?.state ?? "disabled"}</em>
                              </span>
                              {activeSettingsPlatform === platform ? <Check size={13} aria-hidden="true" /> : null}
                            </span>
                            <IntegrationDot state={health?.integrations.statuses[platform]?.state} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="settings-tabs" role="tablist" aria-label="Settings platforms">
                    {settingsPlatformOrder.map((platform) => (
                      <button
                        className={`settings-tab ${activeSettingsPlatform === platform ? "settings-tab-active" : ""}`}
                        type="button"
                        role="tab"
                        aria-selected={activeSettingsPlatform === platform}
                        key={platform}
                        onClick={() => setActiveSettingsPlatform(platform)}
                      >
                        <PlatformBadge platform={platform} />
                        <span>{platformLabels[platform]}</span>
                        <IntegrationDot state={health?.integrations.statuses[platform]?.state} />
                      </button>
                    ))}
                  </div>
                  <button className="icon-button settings-nav-button" type="button" title="Next platform" onClick={() => cycleSettingsPlatform(1)}>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {activeSettingsPlatform === "twitch" ? (
                <div className="settings-section settings-section-twitch">
              <div className="settings-heading">
                <PlatformBadge platform="twitch" />
                <strong>Twitch</strong>
                <IntegrationDot state={twitchStatus?.state} />
                <span className={`settings-status-label settings-status-${twitchStatus?.state ?? "disabled"}`}>
                  {twitchStatus?.state ?? "disabled"}
                </span>
              </div>
              <div className="settings-control-row">
                <label>
                  <span>Broadcaster</span>
                  <input
                    value={broadcasterLogin}
                    onChange={(event) => updateTwitchBroadcasterLogin(event.target.value)}
                    placeholder="channel login"
                  />
                </label>
                <div className="settings-actions">
                  <button className="secondary-button" type="button" title="Track Twitch broadcaster" onClick={() => void switchTwitchBroadcaster()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Track
                  </button>
                  <button className="secondary-button" type="button" title="Restart Twitch connection" onClick={() => void restartTwitch()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Restart
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    title="Connect Twitch OAuth"
                    onClick={() => (window.location.href = "/api/auth/twitch/start")}
                  >
                    <LogIn size={15} aria-hidden="true" />
                    OAuth
                  </button>
                  <button className="secondary-button danger-button" type="button" title="Disconnect Twitch" onClick={() => void disconnectTwitch()}>
                    <LogOut size={15} aria-hidden="true" />
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="settings-meta">
                <span>Reading as {health?.integrations.twitch.authorizedLogin ?? health?.integrations.twitch.authorizedUserId ?? "not set"}</span>
                <span>{health?.integrations.twitch.trackedBroadcasters?.length ?? 0} tracked</span>
                <span>{health?.integrations.twitch.oauthSessionStored ? "OAuth stored" : "OAuth not stored"}</span>
              </div>
              <div className="settings-target-list" aria-label="Tracked Twitch broadcasters">
                {(health?.integrations.twitch.trackedBroadcasters ?? []).length > 0 ? (
                  health?.integrations.twitch.trackedBroadcasters?.map((target) => (
                    <span className="settings-target-chip" key={target.userId}>
                      <span>{target.login ?? target.displayName ?? target.userId}</span>
                      <button
                        className="ghost-icon"
                        type="button"
                        title={`Remove ${target.login ?? target.displayName ?? target.userId}`}
                        onClick={() => void removeTwitchTarget(target.userId)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="settings-target-empty">No tracked Twitch broadcasters</span>
                )}
              </div>
              <p>{twitchStatus?.detail ?? "Twitch is not configured."}</p>
                </div>
              ) : null}

              {activeSettingsPlatform === "kick" ? (
                <div className="settings-section">
              <div className="settings-heading">
                <PlatformBadge platform="kick" />
                <strong>Kick</strong>
                <IntegrationDot state={kickStatus?.state} />
                <span className={`settings-status-label settings-status-${kickStatus?.state ?? "disabled"}`}>{kickStatus?.state ?? "disabled"}</span>
              </div>
              <div className="settings-control-row">
                <label>
                  <span>Broadcaster</span>
                  <input
                    value={kickBroadcaster}
                    onChange={(event) => updateKickBroadcaster(event.target.value)}
                    placeholder="channel name"
                  />
                </label>
                <div className="settings-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    title={kickSubscribeTitle}
                    disabled={health?.integrations.kick.canSubscribe === false}
                    onClick={() => void subscribeKick()}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    Subscribe
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    title={
                      health?.integrations.kick.canSubscribe === false
                        ? "Connect Kick OAuth before restarting dashboard subscriptions"
                        : "Refresh Kick subscription"
                    }
                    disabled={health?.integrations.kick.canSubscribe === false}
                    onClick={() => void restartKick()}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    Restart
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    title="Connect Kick OAuth"
                    onClick={() => (window.location.href = "/api/auth/kick/start")}
                  >
                    <LogIn size={15} aria-hidden="true" />
                    OAuth
                  </button>
                  <button className="secondary-button danger-button" type="button" title="Disconnect Kick" onClick={() => void disconnectKick()}>
                    <LogOut size={15} aria-hidden="true" />
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="settings-meta">
                <span>{kickAuthorizationLabel}</span>
                <span>{kickCredentials?.clientId && kickCredentials.clientSecret ? "Client credentials set" : "Client credentials missing"}</span>
                <span>{health?.integrations.kick.ingestionEnabled ? "Ingestion on" : "Ingestion paused"}</span>
                <span>{health?.integrations.kick.oauthSessionStored ? "Operator OAuth stored" : "Operator OAuth not stored"}</span>
                <span>Target {health?.integrations.kick.broadcasterSlug ?? health?.integrations.kick.broadcasterUserId ?? "not set"}</span>
                <span>{health?.integrations.kick.autoSubscribeEnabled ? "Auto-subscribe on" : "Manual subscribe"}</span>
                <span>{kickCredentials?.publicKey ? "Signature on" : "Signature off"}</span>
              </div>
              <div className="settings-target-list" aria-label="Tracked Kick broadcasters">
                {(health?.integrations.kick.trackedBroadcasters ?? []).length > 0 ? (
                  health?.integrations.kick.trackedBroadcasters?.map((target) => (
                    <span className="settings-target-chip" key={target.userId}>
                      <span>{target.slug ?? target.name ?? target.userId}</span>
                      <button
                        className="ghost-icon"
                        type="button"
                        title={`Remove ${target.slug ?? target.name ?? target.userId}`}
                        onClick={() => void removeKickTarget(target.userId)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="settings-target-empty">No tracked Kick broadcasters</span>
                )}
              </div>
              <p>{kickStatus?.detail ?? "Kick webhooks need a public HTTPS callback."}</p>
              <p className="settings-url">{health?.integrations.kick.webhookUrl ?? "Set KICK_WEBHOOK_URL to document the public callback."}</p>
                </div>
              ) : null}

              {activeSettingsPlatform === "x" ? (
                <div className="settings-section">
              <div className="settings-heading">
                <PlatformBadge platform="x" />
                <strong>X</strong>
                <IntegrationDot state={xStatus?.state} />
                <span className={`settings-status-label settings-status-${xStatus?.state ?? "disabled"}`}>{xStatus?.state ?? "disabled"}</span>
              </div>
              <div className="settings-control-row">
                <label>
                  <span>Target Account</span>
                  <input value={xTargetAccount} onChange={(event) => updateXTargetAccount(event.target.value)} placeholder="account or livechat URL" />
                </label>
                <div className="settings-actions">
                  <button
                    className="secondary-button settings-primary-action"
                    type="button"
                    title="Open guided X source setup"
                    onClick={() => {
                      setXConnectStatus("");
                      setXConnectOpen(true);
                    }}
                  >
                    <LogIn size={15} aria-hidden="true" />
                    Connect Sources
                  </button>
                  <button className="secondary-button danger-button" type="button" title="Stop X livechat capture" onClick={() => void stopXLiveChat()}>
                    <LogOut size={15} aria-hidden="true" />
                    Stop Workers
                  </button>
                  <button className="secondary-button" type="button" title="Save X target" onClick={() => void switchXTargetAccount()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Target
                  </button>
                  <button className="secondary-button" type="button" title="Save X rules" onClick={() => void saveXRules()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Rules
                  </button>
                  <button className="secondary-button" type="button" title="Restart X stream" onClick={() => void restartX()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Restart
                  </button>
                  <button className="secondary-button danger-button" type="button" title="Stop X stream" onClick={() => void stopX()}>
                    <LogOut size={15} aria-hidden="true" />
                    Stop
                  </button>
                </div>
              </div>
              <div className="settings-control-row settings-control-row-full">
                <label>
                  <span>Filtered Rules</span>
                  <input value={xRules} onChange={(event) => updateXRules(event.target.value)} placeholder="from:account|account" />
                </label>
              </div>
              <div className="settings-meta">
                <span>{health?.integrations.x.configured ? "Bearer set" : "Bearer missing"}</span>
                <span>{health?.integrations.x.autoStartEnabled ? "Auto-start on" : "Manual start"}</span>
                <span>{health?.integrations.x.streamEnabled ? "Stream running" : "Stream stopped"}</span>
                <span>{health?.integrations.x.liveChatCapture?.running ? "Live chat running" : "Live chat stopped"}</span>
                <span>{health?.integrations.x.liveChatCapture?.workerAutoStart ? "Worker auto-start on" : "Worker auto-start off"}</span>
                <span>{health?.integrations.x.liveChatCapture?.chromeFound ? "Chrome found" : "Chrome missing"}</span>
                <span>{health?.integrations.x.liveCapture?.tokenRequired ? "Capture token on" : "Capture bridge ready"}</span>
                <span>{activeXLiveTargets.length} livechat targets</span>
                <span>{xRuleCount} rules</span>
              </div>
              <div className="settings-target-list" aria-label="Active X livechat targets">
                {activeXLiveTargets.length > 0 ? (
                  activeXLiveTargets.map((target) => (
                    <span className="settings-target-chip" key={target.id}>
                      <span>{target.channelName}</span>
                      <button
                        className="ghost-icon"
                        type="button"
                        title={`Stop ${target.channelName}`}
                        onClick={() => void removeXLiveChatTarget(target.id)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="settings-target-empty">No active X livechat targets</span>
                )}
              </div>
              <p className="settings-url">{health?.integrations.x.liveCapture?.scriptPath ?? "/x-live-capture.js"}</p>
              <p>{xStatus?.detail ?? "X uses Filtered Stream rules for public posts."}</p>
                </div>
              ) : null}

              <details className="settings-advanced-panel" open>
                <summary>
                  <Settings size={15} aria-hidden="true" />
                  <span>Advanced Settings</span>
                </summary>
                <div className="runtime-settings-grid">
                  <label>
                    <span>Message Limit</span>
                    <input
                      value={runtimeMessageHistoryLimit}
                      inputMode="numeric"
                      onChange={(event) => {
                        markRuntimeConfigEdited();
                        setRuntimeMessageHistoryLimit(event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    <span>Viewer Poll (sec)</span>
                    <input
                      value={runtimeViewerPollSeconds}
                      inputMode="numeric"
                      onChange={(event) => {
                        markRuntimeConfigEdited();
                        setRuntimeViewerPollSeconds(event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    <span>Native Rate Limit</span>
                    <input
                      value={runtimeNativeRateLimit}
                      inputMode="numeric"
                      onChange={(event) => {
                        markRuntimeConfigEdited();
                        setRuntimeNativeRateLimit(event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    <span>Rate Window (sec)</span>
                    <input
                      value={runtimeNativeRateWindowSeconds}
                      inputMode="numeric"
                      onChange={(event) => {
                        markRuntimeConfigEdited();
                        setRuntimeNativeRateWindowSeconds(event.target.value);
                      }}
                    />
                  </label>
                  <button className="secondary-button runtime-save-button" type="button" onClick={() => void saveRuntimeConfig()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Save
                  </button>
                </div>
                <div className="settings-meta">
                  <span>{health?.messageCount ?? 0} retained messages</span>
                  <span>History cap {health?.runtimeConfig?.messageHistoryLimit ?? health?.messageHistoryLimit ?? "unknown"}</span>
                  <span>Viewer poll {health?.runtimeConfig ? `${Math.round(health.runtimeConfig.viewerPollMs / 1000)}s` : "unknown"}</span>
                  <span>
                    Native rate{" "}
                    {health?.runtimeConfig
                      ? `${health.runtimeConfig.nativeChatRateLimit}/${Math.round(health.runtimeConfig.nativeChatRateWindowMs / 1000)}s`
                      : "unknown"}
                  </span>
                  <span>{health?.demoEnabled ? "Demo messages on" : "Demo messages off"}</span>
                  <span>{health?.configuration.envFileLoaded ? ".env loaded" : ".env missing"}</span>
                  <span>{health?.configuration.realIngestionEnabled ? "Real ingestion on" : "Real ingestion off"}</span>
                  <span>
                    {health?.configuration.nativeModeration?.mutedUserCount ?? 0} native mutes /{" "}
                    {health?.configuration.nativeModeration?.mutedNetworkKeyCount ?? 0} keys
                  </span>
                  <span>{connectionState}</span>
                  <span>{sourceSnapshot.sources.length} source records</span>
                </div>
              </details>
            </div>

            {settingsMessage ? (
              <div className="settings-message" role="status">
                {settingsMessage}
              </div>
            ) : null}
          </section>
        ) : installOpen ? (
          <section className="install-page" aria-label="Website install">
            <div className="stats-page-header">
              <div className="settings-page-title">
                <ExternalLink size={18} aria-hidden="true" />
                <div>
                  <h2>Website Install</h2>
                  <span>Drop-in URLs, iframe snippets, and launch readiness</span>
                </div>
              </div>
              <div className="settings-meta">
                <span>{readinessReadyCount}/{readinessItems.length} ready</span>
                <span>{dashboardInstallConfig?.publicUrl ?? "/live"}</span>
              </div>
            </div>

            <div className="install-grid">
              <section className="install-card install-card-wide">
                <div className="stats-panel-heading">
                  <strong>Preview Routes</strong>
                  <span>Use these before touching the production website</span>
                </div>
                <div className="install-link-list">
                  <a href={dashboardInstallConfig?.publicUrl ?? "/live"} target="_blank" rel="noreferrer">
                    <span>Public live hub</span>
                    <strong>{dashboardInstallConfig?.publicUrl ?? "/live"}</strong>
                  </a>
                  <a href={installEmbedUrl} target="_blank" rel="noreferrer">
                    <span>Full website embed</span>
                    <strong>{installEmbedUrl}</strong>
                  </a>
                  <a href={installChatEmbedUrl} target="_blank" rel="noreferrer">
                    <span>Chat-only embed</span>
                    <strong>{installChatEmbedUrl}</strong>
                  </a>
                  <a href={installMockUrl} target="_blank" rel="noreferrer">
                    <span>Market Bubble proof page</span>
                    <strong>{installMockUrl}</strong>
                  </a>
                  <a href={installConfigUrl} target="_blank" rel="noreferrer">
                    <span>Public config JSON</span>
                    <strong>{installConfigUrl}</strong>
                  </a>
                </div>
              </section>

              <section className="install-card install-card-wide">
                <div className="stats-panel-heading">
                  <strong>Demo Runbook</strong>
                  <span>{demoReadyCount}/{demoItems.length} checks ready</span>
                </div>
                <div className="install-runbook-list">
                  {demoItems.map((item, index) => (
                    <a className={`install-runbook-row ${item.ready ? "install-runbook-ready" : "install-runbook-warn"}`} href={item.href} target="_blank" rel="noreferrer" key={item.label}>
                      <span className="install-runbook-index">{index + 1}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                      <span className="install-runbook-state">{item.ready ? "Ready" : "Check"}</span>
                    </a>
                  ))}
                </div>
              </section>

              <section className="install-card">
                <div className="stats-panel-heading">
                  <strong>Full Hub Snippet</strong>
                  <span>Stream, source switcher, shared chat</span>
                </div>
                <pre className="install-code">{fullEmbedSnippet}</pre>
              </section>

              <section className="install-card">
                <div className="stats-panel-heading">
                  <strong>Chat-Only Snippet</strong>
                  <span>For pages with their own stream player</span>
                </div>
                <pre className="install-code">{chatOnlyEmbedSnippet}</pre>
              </section>

              <section className="install-card install-card-wide">
                <div className="stats-panel-heading">
                  <strong>Launch Readiness</strong>
                  <span>Non-secret configuration checks</span>
                </div>
                <div className="install-readiness-list">
                  {readinessItems.map((item) => (
                    <div className={`install-readiness-row ${item.ready ? "install-readiness-ready" : "install-readiness-warn"}`} key={item.label}>
                      <span className="install-readiness-icon">{item.ready ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : statsOpen ? (
          <section className="stats-page" aria-label="Live stats dashboard">
            <div className="stats-page-header">
              <div className="settings-page-title">
                <BarChart3 size={18} aria-hidden="true" />
                <div>
                  <h2>Live Stats</h2>
                  <span>Viewer share, message flow, sources, and retained chat activity</span>
                </div>
              </div>
              <div className="settings-meta">
                <span>{connectionState}</span>
                <span>{sourceSnapshot.sources.length} sources</span>
                <span>{statsSnapshot.unknownSourceCount} unknown viewer counts</span>
              </div>
            </div>

            <div className="stats-grid">
              <section className="stats-kpi">
                <span>Known Viewers</span>
                <strong>{formatViewerCount(statsSnapshot.totalKnownViewers)}</strong>
              </section>
              <section className="stats-kpi">
                <span>Retained Messages</span>
                <strong>{formatViewerCount(statsSnapshot.totalMessages)}</strong>
              </section>
              <section className="stats-kpi">
                <span>Unique Chatters</span>
                <strong>{formatViewerCount(statsSnapshot.uniqueChatters)}</strong>
              </section>
              <section className="stats-kpi">
                <span>Messages / Min</span>
                <strong>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(statsSnapshot.messagesPerMinute)}</strong>
              </section>
            </div>

            <div className="stats-panels">
              <section className="stats-panel">
                <div className="stats-panel-heading">
                  <strong>Platform Breakdown</strong>
                  <span>Viewer share and chat share</span>
                </div>
                <div className="stats-platform-list">
                  {statsSnapshot.platformRows.map((row) => (
                    <div className="stats-platform-row" key={row.platform}>
                      <div className="stats-row-title">
                        <PlatformBadge platform={row.platform} />
                        <strong>{platformLabels[row.platform]}</strong>
                        <span>{row.chatterCount} chatters</span>
                      </div>
                      <div className="stats-meter-group">
                        <div className="stats-meter-line">
                          <span>{formatViewerCount(row.viewerCount)} viewers</span>
                          <strong>{formatPercent(row.viewerPercent)}</strong>
                          <div className="stats-meter">
                            <span style={{ width: `${Math.min(row.viewerPercent, 100)}%` }} />
                          </div>
                        </div>
                        <div className="stats-meter-line">
                          <span>{formatViewerCount(row.messageCount)} messages</span>
                          <strong>{formatPercent(row.messagePercent)}</strong>
                          <div className="stats-meter stats-meter-muted">
                            <span style={{ width: `${Math.min(row.messagePercent, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="stats-panel">
                <div className="stats-panel-heading">
                  <strong>Source Breakdown</strong>
                  <span>Tracked stream and chat sources</span>
                </div>
                <div className="stats-source-list">
                  {statsSnapshot.sourceRows.length > 0 ? (
                    statsSnapshot.sourceRows.map((source) => (
                      <div className="stats-source-row" key={source.id}>
                        <div className="stats-row-title">
                          <PlatformBadge platform={source.platform} />
                          <strong>{source.label}</strong>
                          <span>{source.status}</span>
                        </div>
                        <div className="stats-source-metrics">
                          <span>{source.viewerCount === null ? "unknown viewers" : `${formatViewerCount(source.viewerCount)} viewers`}</span>
                          <span>{formatViewerCount(source.messageCount)} messages</span>
                          <span>{source.chatterCount} chatters</span>
                        </div>
                        <div className="stats-meter">
                          <span style={{ width: `${Math.min(Math.max(source.viewerPercent, source.messagePercent), 100)}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="stats-empty">No active source records yet.</span>
                  )}
                </div>
              </section>

              <section className="stats-panel stats-panel-wide">
                <div className="stats-panel-heading">
                  <strong>Top Chatters</strong>
                  <span>Based on the retained chat buffer</span>
                </div>
                <div className="stats-chatter-list">
                  {statsSnapshot.topChatters.length > 0 ? (
                    statsSnapshot.topChatters.map((chatter) => (
                      <div className="stats-chatter-row" key={chatter.key}>
                        <div className="stats-row-title">
                          <PlatformBadge platform={chatter.platform} />
                          <strong>{chatter.displayName}</strong>
                          <span>{chatter.sourceLabel || platformLabels[chatter.platform]}</span>
                        </div>
                        <div className="stats-source-metrics">
                          <span>{formatViewerCount(chatter.count)} messages</span>
                          <span>{chatter.sourceCount} sources</span>
                          <span>@{chatter.username}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="stats-empty">No chatters in the retained buffer yet.</span>
                  )}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <>
            <section className="chat-panel" aria-label="Unified live chat">
              <div className="message-list">
                <Virtuoso
                  ref={virtuosoRef}
                  data={displayedMessages}
                  components={virtuosoComponents}
                  context={chatVirtuosoContext}
                  atBottomThreshold={72}
                  atBottomStateChange={(bottom) => {
                    if (bottom && !lockedMessages && !paused) {
                      setAtBottom(true);
                      readingLockedRef.current = false;
                      setReadingLocked(false);
                      setNewMessagesAway(0);
                    } else if (lockedMessages || readingLockedRef.current || paused) {
                      setAtBottom(false);
                    }
                  }}
                  followOutput={lockedMessages || paused || readingLocked ? false : "auto"}
                  itemContent={(_, message) => {
                    const nativeMessage = isNativeMarketBubbleMessage(message);
                    const nativeUserId = message.platformUserId ?? "";

                    return (
                      <MessageRow
                        message={message}
                        preferences={chatPreferences}
                        betterTtvEmotes={betterTtvEmotesForMessage(message)}
                        moderation={{
                          canRemove: nativeMessage,
                          removePending: moderatingMessageIds.has(message.id),
                          onRemove: () => void hideNativeMessage(message),
                          canMuteUser: nativeMessage && Boolean(nativeUserId),
                          mutePending: mutingNativeUserIds.has(nativeUserId),
                          onMuteUser: () => void muteNativeGuest(message)
                        }}
                      />
                    );
                  }}
                />
              </div>
              {lockedMessages && displayedMessages.length > 0 ? (
                <button className="jump-current-button" type="button" onClick={jumpToCurrent}>
                  <ArrowDown size={15} aria-hidden="true" />
                  {newMessagesAway > 0 ? `${newMessagesAway} new` : "Jump to current"}
                </button>
              ) : null}
              {moderationStatus ? (
                <div className="moderation-status" role="status">
                  {moderationStatus}
                </div>
              ) : null}
            </section>

            <form
              className="composer-bar"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMockMessage();
              }}
            >
              <select value={mockPlatform} onChange={(event) => setMockPlatform(event.target.value as Platform)} aria-label="Mock platform">
                <option value="twitch">Twitch</option>
                <option value="kick">Kick</option>
                <option value="x">X</option>
                <option value="marketbubble">Market Bubble</option>
              </select>
              <input value={mockText} onChange={(event) => setMockText(event.target.value)} aria-label="Mock message" />
              <button className="primary-button" type="submit">
                <Send size={15} aria-hidden="true" />
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
