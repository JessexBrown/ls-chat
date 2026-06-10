(() => {
  const defaultConfig = {
    endpoint: "http://localhost:4200/api/capture/x-live",
    token: "",
    channelName: "",
    rowSelector: '[role="listitem"], [data-testid="cellInnerDiv"], article, [data-testid*="chat" i], [aria-label*="chat" i] > div',
    scanMs: 1200
  };

  const state = {
    config: { ...defaultConfig },
    seen: new Set(),
    pending: [],
    observer: null,
    interval: null,
    flushTimer: null,
    root: null,
    selecting: false,
    panel: null,
    statusNode: null
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function simpleHash(value) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isBroadcastPage() {
    return /\/i\/broadcasts\//.test(window.location.pathname);
  }

  function pageChannelName() {
    return (
      state.config.channelName ||
      document.title.replace(/\s*[\/|]\s*X\s*$/i, "").trim() ||
      "X Live Broadcast"
    );
  }

  function setStatus(text) {
    if (state.statusNode) {
      state.statusNode.textContent = text;
    }
    state.lastStatus = text;
  }

  function ensurePanel() {
    if (state.panel) {
      return;
    }

    const panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "max-width:320px",
      "border:1px solid rgba(231,234,238,.28)",
      "border-radius:10px",
      "padding:12px",
      "background:#101318",
      "color:#f2f5f8",
      "font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "box-shadow:0 16px 50px rgba(0,0,0,.45)"
    ].join(";");
    panel.innerHTML = `
      <strong style="display:block;margin-bottom:6px;">LS Chat X Capture</strong>
      <span data-ls-status>Ready.</span>
    `;
    document.documentElement.appendChild(panel);
    state.panel = panel;
    state.statusNode = panel.querySelector("[data-ls-status]");
  }

  function usefulLines(element) {
    const text = cleanText(element.innerText || element.textContent || "");
    if (!text || text.length < 2 || text.length > 700) {
      return [];
    }

    return text
      .split(/\n+/)
      .map(cleanText)
      .filter(Boolean)
      .filter((line) => !/^(reply|repost|like|share|views?|view post|show more|translate post)$/i.test(line))
      .filter((line) => !/^\d+\s?(s|m|h|d)$/.test(line));
  }

  function parseRow(element) {
    if (!isVisible(element)) {
      return null;
    }

    const lines = usefulLines(element);
    if (lines.length === 0) {
      return null;
    }

    const combined = cleanText(lines.join(" "));
    const inlineMatch = /^@?([A-Za-z0-9_]{1,32})\s*[:\-]\s+(.{1,500})$/.exec(combined);
    if (inlineMatch) {
      return {
        username: inlineMatch[1],
        displayName: inlineMatch[1],
        message: inlineMatch[2]
      };
    }

    const handleLine = lines.find((line) => /^@?[A-Za-z0-9_]{1,32}$/.test(line));
    const username = cleanText((handleLine || lines[0]).replace(/^@/, ""));
    const messageLines = lines.filter((line) => line !== handleLine && line !== lines[0]);
    const message = cleanText(messageLines.length > 0 ? messageLines.join(" ") : lines.slice(1).join(" "));

    if (!username || !message || username === message || message.length < 1) {
      return null;
    }

    return {
      username,
      displayName: username,
      message
    };
  }

  function enqueue(parsed) {
    const channelName = pageChannelName();
    const signature = simpleHash([location.href, channelName, parsed.username, parsed.message].join("|"));
    if (state.seen.has(signature)) {
      return;
    }

    state.seen.add(signature);
    state.pending.push({
      platformMessageId: `extension:${signature}`,
      username: parsed.username,
      displayName: parsed.displayName || parsed.username,
      message: parsed.message,
      channelName,
      channelId: location.href,
      sourceUrl: location.href,
      capturedAt: new Date().toISOString()
    });

    scheduleFlush();
  }

  function scan() {
    if (!state.root) {
      return;
    }

    const rows = Array.from(state.root.querySelectorAll(state.config.rowSelector));
    const candidates = rows.length > 0 ? rows : Array.from(state.root.children);
    for (const candidate of candidates) {
      const parsed = parseRow(candidate);
      if (parsed) {
        enqueue(parsed);
      }
    }
  }

  function scheduleFlush() {
    if (state.flushTimer) {
      return;
    }

    state.flushTimer = window.setTimeout(flush, 350);
  }

  async function flush() {
    state.flushTimer = null;
    if (state.pending.length === 0) {
      return;
    }

    const messages = state.pending.splice(0, 25);
    try {
      const headers = { "Content-Type": "application/json" };
      if (state.config.token) {
        headers["X-LS-Chat-Capture-Token"] = state.config.token;
      }

      const response = await fetch(state.config.endpoint, {
        method: "POST",
        mode: "cors",
        headers,
        body: JSON.stringify({
          token: state.config.token || undefined,
          sourceUrl: location.href,
          channelName: pageChannelName(),
          messages
        })
      });

      if (!response.ok) {
        setStatus(`Capture post failed: ${response.status}`);
        state.pending.unshift(...messages);
        return;
      }

      const result = await response.json().catch(() => ({ added: messages.length }));
      setStatus(`Capturing. Sent ${result.added ?? messages.length} new message(s).`);
    } catch (error) {
      setStatus(`Capture post failed: ${String(error)}`);
      state.pending.unshift(...messages);
    }
  }

  function candidateChatRoots() {
    return Array.from(
      document.querySelectorAll(
        '[role="log"], [role="list"], [aria-label*="chat" i], [aria-label*="comments" i], [data-testid*="chat" i]'
      )
    )
      .filter(isVisible)
      .map((element) => ({
        element,
        score:
          element.querySelectorAll(state.config.rowSelector).length * 4 +
          Math.min(cleanText(element.innerText || element.textContent || "").length / 80, 10)
      }))
      .sort((left, right) => right.score - left.score);
  }

  function autoRoot() {
    return candidateChatRoots()[0]?.element ?? null;
  }

  function nearestRoot(target) {
    const preferred = target.closest?.(
      '[role="log"], [role="list"], [aria-label*="chat" i], [aria-label*="comments" i], [data-testid*="chat" i]'
    );
    if (preferred) {
      return preferred;
    }

    let current = target;
    for (let depth = 0; depth < 5 && current?.parentElement; depth += 1) {
      current = current.parentElement;
    }
    return current || target;
  }

  function beginWithRoot(root) {
    stopCapture({ removePanel: false });
    ensurePanel();
    state.root = root;
    state.root.style.outline = "2px solid #53fc18";
    state.root.style.outlineOffset = "2px";
    state.observer = new MutationObserver(() => scan());
    state.observer.observe(state.root, { childList: true, subtree: true, characterData: true });
    state.interval = window.setInterval(scan, Number(state.config.scanMs) || defaultConfig.scanMs);
    scan();
    setStatus("Capturing selected X live chat area.");
  }

  function selectChatArea() {
    ensurePanel();
    state.selecting = true;
    setStatus("Click the visible chat area or one chat message.");
    window.addEventListener("click", selectOnce, true);
  }

  function selectOnce(event) {
    if (state.panel?.contains(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener("click", selectOnce, true);
    state.selecting = false;
    beginWithRoot(nearestRoot(event.target));
  }

  function stopCapture(options = {}) {
    state.observer?.disconnect();
    state.observer = null;
    if (state.interval) {
      window.clearInterval(state.interval);
      state.interval = null;
    }
    if (state.flushTimer) {
      window.clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    if (state.root) {
      state.root.style.outline = "";
      state.root.style.outlineOffset = "";
      state.root = null;
    }
    state.pending = [];
    state.selecting = false;
    window.removeEventListener("click", selectOnce, true);
    if (options.removePanel !== false) {
      state.panel?.remove();
      state.panel = null;
      state.statusNode = null;
    }
  }

  async function loadStoredConfig() {
    const stored = await chrome.storage.local.get(defaultConfig);
    state.config = {
      ...defaultConfig,
      ...stored
    };
  }

  async function startCapture(options = {}) {
    await loadStoredConfig();
    state.config = {
      ...state.config,
      ...options,
      channelName: options.channelName ?? state.config.channelName
    };
    await chrome.storage.local.set(state.config);

    const detected = autoRoot();
    if (detected) {
      beginWithRoot(detected);
      return { ok: true, mode: "auto", status: state.lastStatus };
    }

    selectChatArea();
    return { ok: true, mode: "select", status: state.lastStatus };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ls-chat-x-start") {
      startCapture(message.options ?? {}).then(sendResponse);
      return true;
    }

    if (message?.type === "ls-chat-x-select") {
      selectChatArea();
      sendResponse({ ok: true, mode: "select", status: state.lastStatus });
      return false;
    }

    if (message?.type === "ls-chat-x-stop") {
      stopCapture();
      sendResponse({ ok: true, status: "Stopped." });
      return false;
    }

    if (message?.type === "ls-chat-x-status") {
      sendResponse({
        ok: true,
        isBroadcastPage: isBroadcastPage(),
        capturing: Boolean(state.root),
        selecting: state.selecting,
        status: state.lastStatus ?? "Ready."
      });
      return false;
    }

    return false;
  });

  loadStoredConfig();
})();
