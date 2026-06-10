import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  LogIn,
  LogOut,
  MessageCircle,
  Palette,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type Components, type ScrollerProps, type VirtuosoHandle } from "react-virtuoso";
import type { ChatMessage, Platform, StreamSource, ViewerSnapshot } from "../shared/chat";
import { useChatStream } from "./useChatStream";

const platformLabels: Record<Platform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  marketbubble: "MarketBubble"
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
  { id: "marketbubble", label: "MarketBubble" },
  { id: "tradefloor", label: "Trading Floor" },
  { id: "studio", label: "Studio" }
];

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
        profilePath: string;
        debugPort: number;
        chromeFound: boolean;
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
  streamEmbedUrl: string | null;
  streamWatchUrl: string | null;
  description: string;
  updatedAt: string;
};

type PublicDashboardConfig = {
  id?: string;
  title: string;
  nativeChatLabel: string;
  streamEmbedUrl: string | null;
  streamWatchUrl: string | null;
  streamSources?: StreamSource[];
  description?: string;
  updatedAt?: string;
  publicUrl: string;
};

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

function sourceTitle(message: ChatMessage) {
  const sourceLabel = message.sourceLabel ?? message.channelName ?? platformLabels[message.platform];
  return `${platformLabels[message.platform]} / ${sourceLabel}`;
}

function ViewerSummary({ snapshot }: { snapshot: ViewerSnapshot }) {
  const sourceLines = snapshot.sources.length
    ? snapshot.sources
        .map((source) => {
          const count = source.viewerCount === null ? "unknown" : formatViewerCount(source.viewerCount);
          return `${platformLabels[source.platform]} / ${source.label}: ${count}`;
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
                <span>{source.label}</span>
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

  return pieces.length > 0 ? pieces.join(" / ") : source.detail ?? "Feed available";
}

function isDevelopmentStreamSource(source: StreamSource) {
  return source.id.startsWith("local-dev:") || source.id.includes(":local-dev") || source.label.trim().toLowerCase() === "local development";
}

function MessageRow({ message }: { message: ChatMessage }) {
  const [metadataOpen, setMetadataOpen] = useState(false);
  const displayName = message.displayName ?? message.username;
  const originLabel = sourceTitle(message);
  const sourceLabel = message.sourceLabel ?? message.channelName ?? platformLabels[message.platform];
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
    <article className={`message-row message-row-${message.platform}`}>
      <div className="message-line">
        <PlatformBadge platform={message.platform} />
        <time className="message-time">{formatTime(message.sentAt ?? message.receivedAt)}</time>
        <span className="message-channel" title={originLabel}>
          {sourceLabel}
        </span>
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
        <span className="message-text">{message.message}</span>
      </div>
    </article>
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

async function responseErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function App() {
  const isPublicDashboard = window.location.pathname.startsWith("/live");
  const { messages, connectionState, counts, sourceSnapshot } = useChatStream(isPublicDashboard ? "viewer" : "admin");
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
  const [activeSettingsPlatform, setActiveSettingsPlatform] = useState<Exclude<Platform, "marketbubble">>("twitch");
  const [broadcasterLogin, setBroadcasterLogin] = useState("");
  const [kickBroadcaster, setKickBroadcaster] = useState("");
  const [xTargetAccount, setXTargetAccount] = useState("");
  const [xRules, setXRules] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionNativeChatLabel, setSessionNativeChatLabel] = useState("");
  const [sessionStreamEmbedUrl, setSessionStreamEmbedUrl] = useState("");
  const [sessionStreamWatchUrl, setSessionStreamWatchUrl] = useState("");
  const [sessionDescription, setSessionDescription] = useState("");
  const [mockText, setMockText] = useState("Testing the unified feed");
  const [mockPlatform, setMockPlatform] = useState<Platform>("twitch");
  const [publicConfig, setPublicConfig] = useState<PublicDashboardConfig | null>(null);
  const [activeStreamSourceId, setActiveStreamSourceId] = useState(() => window.localStorage.getItem("ls-chat-active-stream-source") ?? "");
  const [streamFrameRefreshKey, setStreamFrameRefreshKey] = useState(0);
  const [nativeClientId] = useState(() => initialNativeClientId());
  const [nativeMessage, setNativeMessage] = useState("");
  const [nativeStatus, setNativeStatus] = useState("");
  const [visualPreset, setVisualPreset] = useState<VisualPreset>(() => initialVisualPreset());

  useEffect(() => {
    document.documentElement.dataset.theme = visualPreset;
    window.localStorage.setItem("ls-chat-visual-preset", visualPreset);
  }, [visualPreset]);

  const loadHealth = useCallback(async () => {
    const response = await fetch("/api/health");
    if (!response.ok) {
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
      setSessionTitle(nextHealth.liveSession.title);
      setSessionNativeChatLabel(nextHealth.liveSession.nativeChatLabel);
      setSessionStreamEmbedUrl(nextHealth.liveSession.streamEmbedUrl ?? "");
      setSessionStreamWatchUrl(nextHealth.liveSession.streamWatchUrl ?? "");
      setSessionDescription(nextHealth.liveSession.description ?? "");
    }
  }, [broadcasterLogin, kickBroadcaster, xRules, xTargetAccount]);

  useEffect(() => {
    if (isPublicDashboard) {
      return undefined;
    }

    void loadHealth();
    const interval = window.setInterval(() => void loadHealth(), 5000);
    return () => window.clearInterval(interval);
  }, [isPublicDashboard, loadHealth]);

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
            setPublicConfig(body.dashboard);
          }
        })
        .catch(() => undefined);
    };

    loadPublicConfig();
    const interval = window.setInterval(loadPublicConfig, 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
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

  const streamSources = useMemo<StreamSource[]>(() => {
    const configuredSources = (publicConfig?.streamSources ?? []).filter((source) => !isDevelopmentStreamSource(source));
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
          detail: publicConfig.description ?? null,
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

    await fetch("/api/mock/messages", {
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
    const username = shortNativeClientId(nativeClientId);
    if (!text) {
      return;
    }

    setNativeStatus("");
    const response = await fetch("/api/native-chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: nativeClientId,
        username,
        message: text
      })
    });

    if (response.ok) {
      setNativeMessage("");
      setNativeStatus("Sent");
      window.setTimeout(() => setNativeStatus(""), 1800);
      return;
    }

    setNativeStatus(await responseErrorMessage(response, "Message failed."));
  }

  function togglePlatform(platform: Platform) {
    setEnabledPlatforms((current) => ({
      ...current,
      [platform]: !current[platform]
    }));
  }

  function cycleVisualPreset() {
    setVisualPreset((current) => {
      const currentIndex = visualPresets.findIndex((preset) => preset.id === current);
      return visualPresets[(currentIndex + 1) % visualPresets.length].id;
    });
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
    const response = await fetch("/api/integrations/twitch/broadcaster", {
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
    const response = await fetch("/api/integrations/twitch/restart", { method: "POST" });
    setSettingsMessage(response.ok ? "Twitch restart requested." : "Twitch restart failed.");
    await loadHealth();
  }

  async function removeTwitchTarget(target: string) {
    setSettingsMessage("Removing Twitch target...");
    const response = await fetch(`/api/integrations/twitch/targets/${encodeURIComponent(target)}`, { method: "DELETE" });
    setSettingsMessage(response.ok ? "Twitch target removed." : await responseErrorMessage(response, "Twitch target remove failed."));
    await loadHealth();
  }

  async function disconnectTwitch() {
    setSettingsMessage("Disconnecting Twitch...");
    const response = await fetch("/api/integrations/twitch/disconnect", { method: "POST" });
    setSettingsMessage(response.ok ? "Twitch disconnected." : "Twitch disconnect failed.");
    await loadHealth();
  }

  async function subscribeKick() {
    const broadcaster = normalizeAccountName(kickBroadcaster);
    setSettingsMessage("Subscribing Kick webhook...");
    const response = await fetch("/api/integrations/kick/subscribe-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(broadcaster ? { broadcaster } : {})
    });
    setSettingsMessage(response.ok ? "Kick subscription requested." : await responseErrorMessage(response, "Kick subscription failed."));
    await loadHealth();
  }

  async function restartKick() {
    setSettingsMessage("Refreshing Kick subscription...");
    const response = await fetch("/api/integrations/kick/restart", { method: "POST" });
    setSettingsMessage(response.ok ? "Kick subscription refreshed." : "Kick refresh failed.");
    await loadHealth();
  }

  async function removeKickTarget(target: string) {
    setSettingsMessage("Removing Kick target...");
    const response = await fetch(`/api/integrations/kick/targets/${encodeURIComponent(target)}`, { method: "DELETE" });
    setSettingsMessage(response.ok ? "Kick target removed." : await responseErrorMessage(response, "Kick target remove failed."));
    await loadHealth();
  }

  async function disconnectKick() {
    setSettingsMessage("Disconnecting Kick...");
    const response = await fetch("/api/integrations/kick/disconnect", { method: "POST" });
    setSettingsMessage(response.ok ? "Kick disconnected." : "Kick disconnect failed.");
    await loadHealth();
  }

  async function saveXRules(nextRules = xRules) {
    const rules = nextRules.trim();
    setSettingsMessage("Saving X rules...");
    const response = await fetch("/api/integrations/x/rules", {
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
    const response = await fetch("/api/integrations/x/restart", { method: "POST" });
    setSettingsMessage(response.ok ? "X restart requested." : "X restart failed.");
    await loadHealth();
  }

  async function stopX() {
    setSettingsMessage("Stopping X stream...");
    const response = await fetch("/api/integrations/x/stop", { method: "POST" });
    setSettingsMessage(response.ok ? "X stream stopped." : "X stop failed.");
    await loadHealth();
  }

  async function startXLiveChat() {
    const target = xTargetAccount.trim() || accountNameFromXRules(xRules);
    if (!target) {
      setSettingsMessage("Enter an X username or livechat URL first.");
      return;
    }

    const body = /^https:\/\/(x|twitter)\.com\//i.test(target)
      ? { url: target }
      : { username: normalizeAccountName(target) || target };
    setSettingsMessage("Opening X live chat browser...");
    const response = await fetch("/api/integrations/x/livechat/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setSettingsMessage(response.ok ? "X live chat capture started." : await responseErrorMessage(response, "X live chat failed."));
    await loadHealth();
  }

  async function stopXLiveChat() {
    setSettingsMessage("Stopping X live chat capture...");
    const response = await fetch("/api/integrations/x/livechat/stop", { method: "POST" });
    setSettingsMessage(response.ok ? "X live chat capture stopped." : "X live chat stop failed.");
    await loadHealth();
  }

  async function saveLiveSession() {
    setSettingsMessage("Saving live session...");
    const response = await fetch("/api/live-session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: sessionTitle.trim(),
        nativeChatLabel: sessionNativeChatLabel.trim(),
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

  async function removeXLiveChatTarget(targetId: string) {
    setSettingsMessage("Stopping X live chat target...");
    const response = await fetch(`/api/integrations/x/livechat/targets/${encodeURIComponent(targetId)}`, { method: "DELETE" });
    setSettingsMessage(response.ok ? "X live chat target stopped." : await responseErrorMessage(response, "X target stop failed."));
    await loadHealth();
  }

  const twitchStatus = health?.integrations.statuses.twitch;
  const kickStatus = health?.integrations.statuses.kick;
  const xStatus = health?.integrations.statuses.x;
  const kickCredentials = health?.integrations.kick.credentialsPresent;
  const kickTokenSourceLabel = !kickCredentials?.accessToken
    ? "No token"
    : health?.integrations.kick.tokenSource === "oauth"
      ? "OAuth token"
      : "App token";
  const xRuleCount = health?.integrations.x.rules?.length ?? 0;
  const activeXLiveTargets = health?.integrations.x.liveChatCapture?.activeTargets ?? [];

  if (isPublicDashboard) {
    const dashboardTitle = publicConfig?.title ?? "MarketBubble Live";
    const dashboardDescription = publicConfig?.description ?? "";
    const streamEmbedUrl = activeStreamSource?.embedUrl ?? publicConfig?.streamEmbedUrl ?? null;
    const streamWatchUrl =
      activeStreamSource?.watchUrl ??
      publicConfig?.streamWatchUrl ??
      sourceSnapshot.sources.find((source) => source.status === "live" && source.sourceUrl)?.sourceUrl ??
      null;
    const activeStreamMeta = activeStreamSource ? streamSourceMeta(activeStreamSource) : "Feed unavailable";

    return (
      <main className="public-shell">
        <header className="public-header">
          <div className="public-brand">
            <Radio size={16} aria-hidden="true" />
            <div>
              <h1>{dashboardTitle}</h1>
              {dashboardDescription ? <span>{dashboardDescription}</span> : null}
            </div>
          </div>
          <div className="public-header-actions">
            <button className="icon-button style-preset-button" type="button" title={`Style: ${visualPresets.find((preset) => preset.id === visualPreset)?.label}`} onClick={cycleVisualPreset}>
              <Palette size={16} aria-hidden="true" />
            </button>
            <ViewerSummary snapshot={sourceSnapshot} />
            <ConnectionPill state={connectionState} />
          </div>
        </header>

        <section className="public-live-grid">
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
                <div className="stream-source-controls">
                  <label className="stream-source-select-wrap">
                    {activeStreamSource ? <StreamSourceMark source={activeStreamSource} /> : null}
                    <select value={activeStreamSource?.id ?? ""} onChange={(event) => setActiveStreamSourceId(event.target.value)} aria-label="Stream source">
                      {streamSources.map((source) => (
                        <option value={source.id} key={source.id}>
                          {source.label} - {streamSourceMeta(source)}
                        </option>
                      ))}
                    </select>
                  </label>
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
                itemContent={(_, message) => <MessageRow message={message} />}
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
              <span className="native-identity-chip" title={`Local MarketBubble chat ID: ${nativeClientId}`}>
                {shortNativeClientId(nativeClientId)}
              </span>
              <input
                className="native-message-input"
                value={nativeMessage}
                onChange={(event) => setNativeMessage(event.target.value)}
                aria-label="Native chat message"
                placeholder="Chat on MarketBubble"
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
      <section className={`chat-shell ${settingsOpen ? "chat-shell-settings-open" : ""}`}>
        <header className="chat-header">
          <div className="chat-title">
            <div className="chat-title-row">
              <Radio size={16} aria-hidden="true" />
              <h1>MarketBubble Live Desk</h1>
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
            <ViewerSummary snapshot={sourceSnapshot} />
            <ConnectionPill state={connectionState} />
            <button className="icon-button style-preset-button" type="button" title={`Style: ${visualPresets.find((preset) => preset.id === visualPreset)?.label}`} onClick={cycleVisualPreset}>
              <Palette size={16} aria-hidden="true" />
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
              className={`icon-button ${settingsOpen ? "icon-button-active" : ""}`}
              type="button"
              title="Source settings"
              aria-label="Source settings"
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <Settings size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        {settingsOpen ? (
          <section className="settings-page" aria-label="Source settings">
            <div className="settings-page-header">
              <div className="settings-page-title">
                <Settings size={18} aria-hidden="true" />
                <div>
                  <h2>Source Settings</h2>
                  <span>MarketBubble site and platform connections</span>
                </div>
              </div>
            </div>

            <div className={`settings-platform-panel settings-platform-${activeSettingsPlatform}`}>
              <div className="settings-category-heading">
                <div>
                  <Radio size={15} aria-hidden="true" />
                  <strong>MarketBubble Site</strong>
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
                      placeholder="MarketBubble Live"
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
                      placeholder="MarketBubble"
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
                  <button className="secondary-button" type="button" title="Subscribe Kick webhook" onClick={() => void subscribeKick()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Subscribe
                  </button>
                  <button className="secondary-button" type="button" title="Refresh Kick subscription" onClick={() => void restartKick()}>
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
                <span>{kickCredentials?.accessToken ? "Token set" : "Token missing"}</span>
                <span>{kickTokenSourceLabel}</span>
                <span>{health?.integrations.kick.ingestionEnabled ? "Ingestion on" : "Ingestion paused"}</span>
                <span>{health?.integrations.kick.oauthSessionStored ? "OAuth stored" : "OAuth not stored"}</span>
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
                  <button className="secondary-button" type="button" title="Open X livechat capture browser" onClick={() => void startXLiveChat()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Live Chat
                  </button>
                  <button className="secondary-button danger-button" type="button" title="Stop X livechat capture" onClick={() => void stopXLiveChat()}>
                    <LogOut size={15} aria-hidden="true" />
                    Stop Chat
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

              <details className="settings-advanced-panel">
                <summary>
                  <Settings size={15} aria-hidden="true" />
                  <span>Advanced Diagnostics</span>
                </summary>
                <div className="settings-meta">
                  <span>{health?.messageCount ?? 0} retained messages</span>
                  <span>{health?.demoEnabled ? "Demo messages on" : "Demo messages off"}</span>
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
                  itemContent={(_, message) => <MessageRow message={message} />}
                />
              </div>
              {lockedMessages && displayedMessages.length > 0 ? (
                <button className="jump-current-button" type="button" onClick={jumpToCurrent}>
                  <ArrowDown size={15} aria-hidden="true" />
                  {newMessagesAway > 0 ? `${newMessagesAway} new` : "Jump to current"}
                </button>
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
                <option value="marketbubble">MarketBubble</option>
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
