import { ArrowDown, ChevronLeft, ChevronRight, LogIn, LogOut, Pause, Play, Radio, RefreshCw, Search, Send, Settings, Wifi, WifiOff, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type Components, type ScrollerProps, type VirtuosoHandle } from "react-virtuoso";
import type { ChatMessage, Platform } from "../shared/chat";
import { useChatStream } from "./useChatStream";

const platformLabels: Record<Platform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X"
};

const platformShortLabels: Record<Platform, string> = {
  twitch: "TW",
  kick: "KI",
  x: "X"
};

const platformColors: Record<Platform, string> = {
  twitch: "#a970ff",
  kick: "#53fc18",
  x: "#e7eaee"
};

const platformOrder: Platform[] = ["twitch", "kick", "x"];

type ChatVirtuosoContext = {
  onScrollPositionChange: (scrollTop: number) => void;
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
      />
    );
  })
};

type IntegrationState = "disabled" | "connecting" | "connected" | "subscribed" | "error";

type IntegrationStatus = {
  state: IntegrationState;
  detail: string;
  updatedAt: string;
};

type HealthResponse = {
  demoEnabled: boolean;
  messageCount: number;
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className={`platform-badge platform-${platform}`}>{platformShortLabels[platform]}</span>;
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

function MessageRow({ message }: { message: ChatMessage }) {
  const displayName = message.displayName ?? message.username;
  const channelName = message.channelName ?? platformLabels[message.platform];

  return (
    <article className={`message-row message-row-${message.platform}`}>
      <div className="message-line">
        <PlatformBadge platform={message.platform} />
        <time className="message-time">{formatTime(message.sentAt ?? message.receivedAt)}</time>
        <span className="message-channel" title={channelName}>
          {channelName}
        </span>
        <span className="message-username" style={{ color: message.color ?? platformColors[message.platform] }}>
          {displayName}
        </span>
        {message.badges.slice(0, 2).map((badge) => (
          <span className="message-badge" title={badge.label} key={`${message.id}-${badge.label}-${badge.type}`}>
            {badge.label.slice(0, 3)}
          </span>
        ))}
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
  const { messages, connectionState, counts } = useChatStream();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const previousVisibleMessageCount = useRef(0);
  const lastScrollTop = useRef(0);
  const readingLockedRef = useRef(false);
  const twitchBroadcasterEdited = useRef(false);
  const kickBroadcasterEdited = useRef(false);
  const xTargetAccountEdited = useRef(false);
  const xRulesEdited = useRef(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [enabledPlatforms, setEnabledPlatforms] = useState<Record<Platform, boolean>>({
    twitch: true,
    kick: true,
    x: true
  });
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [readingLocked, setReadingLocked] = useState(false);
  const [newMessagesAway, setNewMessagesAway] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsPlatform, setActiveSettingsPlatform] = useState<Platform>("twitch");
  const [broadcasterLogin, setBroadcasterLogin] = useState("");
  const [kickBroadcaster, setKickBroadcaster] = useState("");
  const [xTargetAccount, setXTargetAccount] = useState("");
  const [xRules, setXRules] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [mockText, setMockText] = useState("Testing the unified feed");
  const [mockPlatform, setMockPlatform] = useState<Platform>("twitch");

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
  }, [broadcasterLogin, kickBroadcaster, xRules, xTargetAccount]);

  useEffect(() => {
    void loadHealth();
    const interval = window.setInterval(() => void loadHealth(), 5000);
    return () => window.clearInterval(interval);
  }, [loadHealth]);

  const filteredMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return messages.filter((message) => {
      const platformAllowed = enabledPlatforms[message.platform];
      const queryAllowed =
        !normalizedQuery ||
        message.message.toLowerCase().includes(normalizedQuery) ||
        message.username.toLowerCase().includes(normalizedQuery) ||
        (message.displayName ?? "").toLowerCase().includes(normalizedQuery) ||
        (message.channelName ?? "").toLowerCase().includes(normalizedQuery);

      return platformAllowed && queryAllowed;
    });
  }, [enabledPlatforms, messages, query]);

  useEffect(() => {
    const previousCount = previousVisibleMessageCount.current;
    if ((readingLocked || !atBottom) && filteredMessages.length > previousCount) {
      setNewMessagesAway((current) => current + filteredMessages.length - previousCount);
    }
    if (atBottom && !readingLocked) {
      setNewMessagesAway(0);
    }
    previousVisibleMessageCount.current = filteredMessages.length;
  }, [atBottom, filteredMessages.length, readingLocked]);

  const setReaderLock = useCallback((locked: boolean) => {
    readingLockedRef.current = locked;
    setReadingLocked(locked);
  }, []);

  const handleChatScroll = useCallback(
    (scrollTop: number) => {
      const previousScrollTop = lastScrollTop.current;
      const delta = scrollTop - previousScrollTop;
      lastScrollTop.current = scrollTop;

      if (delta < -1 && !readingLockedRef.current) {
        setReaderLock(true);
        setAtBottom(false);
      }
    },
    [setReaderLock]
  );

  const chatVirtuosoContext = useMemo(
    () => ({
      onScrollPositionChange: handleChatScroll
    }),
    [handleChatScroll]
  );

  function jumpToCurrent() {
    if (filteredMessages.length === 0) {
      return;
    }

    setReaderLock(false);
    virtuosoRef.current?.scrollToIndex({
      index: filteredMessages.length - 1,
      align: "end",
      behavior: "smooth"
    });
    setAtBottom(true);
    setNewMessagesAway(0);
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

  function togglePlatform(platform: Platform) {
    setEnabledPlatforms((current) => ({
      ...current,
      [platform]: !current[platform]
    }));
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

  function cycleSettingsPlatform(direction: -1 | 1) {
    setActiveSettingsPlatform((current) => {
      const currentIndex = platformOrder.indexOf(current);
      const nextIndex = (currentIndex + direction + platformOrder.length) % platformOrder.length;
      return platformOrder[nextIndex];
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

  return (
    <main className="app-shell">
      <section className={`chat-shell ${settingsOpen ? "chat-shell-settings-open" : ""}`}>
        <header className="chat-header">
          <div className="chat-title">
            <div className="chat-title-row">
              <Radio size={16} aria-hidden="true" />
              <h1>Unified Chat</h1>
            </div>
            <span>
              {filteredMessages.length} shown | {counts.total} total
            </span>
          </div>

          <div className="source-bar" aria-label="Platform filters">
            {(Object.keys(enabledPlatforms) as Platform[]).map((platform) => (
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
            <ConnectionPill state={connectionState} />
            <button
              className={`icon-button ${paused ? "icon-button-active" : ""}`}
              type="button"
              title={paused ? "Resume feed" : "Pause feed"}
              aria-label={paused ? "Resume feed" : "Pause feed"}
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
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
                  <span>{platformLabels[activeSettingsPlatform]}</span>
                </div>
              </div>

              <div className="settings-platform-switcher">
                <button className="icon-button settings-nav-button" type="button" title="Previous platform" onClick={() => cycleSettingsPlatform(-1)}>
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <div className="settings-tabs" role="tablist" aria-label="Settings platforms">
                  {platformOrder.map((platform) => (
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

            <div className={`settings-platform-panel settings-platform-${activeSettingsPlatform}`}>
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
                <span>{xRuleCount} rules</span>
              </div>
              <p className="settings-url">{health?.integrations.x.liveCapture?.scriptPath ?? "/x-live-capture.js"}</p>
              <p>{xStatus?.detail ?? "X uses Filtered Stream rules for public posts."}</p>
                </div>
              ) : null}
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
                  data={filteredMessages}
                  components={virtuosoComponents}
                  context={chatVirtuosoContext}
                  atBottomThreshold={1}
                  atBottomStateChange={(bottom) => {
                    setAtBottom(bottom);
                    if (bottom) {
                      setReaderLock(false);
                      setNewMessagesAway(0);
                    }
                  }}
                  followOutput={paused || readingLocked || !atBottom ? false : "smooth"}
                  itemContent={(_, message) => <MessageRow message={message} />}
                />
              </div>
              {(readingLocked || !atBottom) && filteredMessages.length > 0 ? (
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
