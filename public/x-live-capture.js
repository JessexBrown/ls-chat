(() => {
  const existing = window.LSChatXLiveCapture;
  if (existing?.stop) {
    existing.stop();
  }

  const config = {
    endpoint: window.LS_CHAT_CAPTURE_ENDPOINT || "http://localhost:4200/api/capture/x-live",
    token: window.LS_CHAT_CAPTURE_TOKEN || "",
    channelName:
      window.LS_CHAT_CAPTURE_CHANNEL ||
      document.title.replace(/\s*[\/|]\s*X\s*$/i, "").trim() ||
      "X Live Broadcast",
    rowSelector:
      window.LS_CHAT_CAPTURE_ROW_SELECTOR ||
      '[role="listitem"], [data-testid="cellInnerDiv"], article, [data-testid*="chat" i], [aria-label*="chat" i] > div',
    scanMs: Number(window.LS_CHAT_CAPTURE_SCAN_MS || 1200)
  };

  const seen = new Set();
  const pending = [];
  let observer = null;
  let interval = null;
  let flushTimer = null;
  let root = null;

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
    <span data-ls-status>Click the live chat area or one chat message.</span>
    <button data-ls-stop style="display:block;margin-top:10px;border:1px solid #343b48;border-radius:7px;background:#1b2028;color:#f2f5f8;padding:6px 9px;font-weight:700;">Stop</button>
  `;
  document.documentElement.appendChild(panel);

  const statusNode = panel.querySelector("[data-ls-status]");
  const stopButton = panel.querySelector("[data-ls-stop]");

  function setStatus(text) {
    if (statusNode) {
      statusNode.textContent = text;
    }
  }

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
    const signature = simpleHash([location.href, config.channelName, parsed.username, parsed.message].join("|"));
    if (seen.has(signature)) {
      return;
    }

    seen.add(signature);
    pending.push({
      platformMessageId: `browser:${signature}`,
      username: parsed.username,
      displayName: parsed.displayName || parsed.username,
      message: parsed.message,
      channelName: config.channelName,
      channelId: location.href,
      sourceUrl: location.href,
      capturedAt: new Date().toISOString()
    });

    scheduleFlush();
  }

  function scan() {
    if (!root) {
      return;
    }

    const rows = Array.from(root.querySelectorAll(config.rowSelector));
    const candidates = rows.length > 0 ? rows : Array.from(root.children);
    for (const candidate of candidates) {
      const parsed = parseRow(candidate);
      if (parsed) {
        enqueue(parsed);
      }
    }
  }

  function scheduleFlush() {
    if (flushTimer) {
      return;
    }

    flushTimer = window.setTimeout(flush, 350);
  }

  async function flush() {
    flushTimer = null;
    if (pending.length === 0) {
      return;
    }

    const messages = pending.splice(0, 25);
    try {
      const headers = { "Content-Type": "application/json" };
      if (config.token) {
        headers["X-LS-Chat-Capture-Token"] = config.token;
      }
      const response = await fetch(config.endpoint, {
        method: "POST",
        mode: "cors",
        headers,
        body: JSON.stringify({
          token: config.token || undefined,
          sourceUrl: location.href,
          channelName: config.channelName,
          messages
        })
      });

      if (!response.ok) {
        setStatus(`Capture post failed: ${response.status}`);
        pending.unshift(...messages);
        return;
      }

      const result = await response.json().catch(() => ({ added: messages.length }));
      setStatus(`Capturing. Sent ${result.added ?? messages.length} new message(s).`);
    } catch (error) {
      setStatus(`Capture post failed: ${String(error)}`);
      pending.unshift(...messages);
    }
  }

  function nearestRoot(target) {
    const preferred = target.closest?.('[role="log"], [role="list"], [aria-label*="chat" i], [aria-label*="comments" i], [data-testid*="chat" i]');
    if (preferred) {
      return preferred;
    }

    let current = target;
    for (let depth = 0; depth < 5 && current?.parentElement; depth += 1) {
      current = current.parentElement;
    }
    return current || target;
  }

  function startCapture(target) {
    root = nearestRoot(target);
    root.style.outline = "2px solid #53fc18";
    root.style.outlineOffset = "2px";

    observer = new MutationObserver(() => scan());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    interval = window.setInterval(scan, config.scanMs);
    scan();
    setStatus("Capturing selected X live chat area.");
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    if (interval) {
      window.clearInterval(interval);
      interval = null;
    }
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (root) {
      root.style.outline = "";
      root.style.outlineOffset = "";
    }
    panel.remove();
    window.removeEventListener("click", selectOnce, true);
    delete window.LSChatXLiveCapture;
  }

  function selectOnce(event) {
    if (panel.contains(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener("click", selectOnce, true);
    startCapture(event.target);
  }

  stopButton?.addEventListener("click", stop);
  window.addEventListener("click", selectOnce, true);
  window.LSChatXLiveCapture = { stop, scan };
})();
