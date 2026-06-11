const defaults = {
  endpoint: "http://localhost:4200/api/capture/x-live",
  token: "",
  channelName: "",
  rowSelector: '[role="listitem"], [data-testid="cellInnerDiv"], article, [data-testid*="chat" i], [aria-label*="chat" i] > div',
  scanMs: 1200
};

const fields = {
  endpoint: document.querySelector("#endpoint"),
  token: document.querySelector("#token"),
  channelName: document.querySelector("#channelName")
};
const statusNode = document.querySelector("#status");
const stateNode = document.querySelector("#state");

function setStatus(text) {
  statusNode.textContent = text;
}

function setState(text) {
  stateNode.textContent = text;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function xLiveChatUrl(tab) {
  return Boolean(tab?.url && /^https:\/\/(x|twitter|mobile\.x)\.com\/(i\/broadcasts\/|[^/?#]+\/livechat)/i.test(tab.url));
}

async function sendToActiveTab(type, options) {
  const tab = await activeTab();
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  if (!xLiveChatUrl(tab)) {
    throw new Error("Open an X broadcast or /livechat tab first.");
  }

  return chrome.tabs.sendMessage(tab.id, { type, options });
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(defaults);
  fields.endpoint.value = stored.endpoint || defaults.endpoint;
  fields.token.value = stored.token || "";
  fields.channelName.value = stored.channelName || "";
}

async function saveSettings() {
  const next = {
    endpoint: fields.endpoint.value.trim() || defaults.endpoint,
    token: fields.token.value,
    channelName: fields.channelName.value.trim(),
    rowSelector: defaults.rowSelector,
    scanMs: defaults.scanMs
  };
  await chrome.storage.local.set(next);
  return next;
}

async function refreshStatus() {
  try {
    const tab = await activeTab();
    if (!xLiveChatUrl(tab)) {
      setState("Idle");
      setStatus("Open an X broadcast or /livechat tab first.");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "ls-chat-x-status" });
    setState(response?.capturing ? "Capturing" : response?.selecting ? "Selecting" : "Ready");
    setStatus(response?.status ?? "Ready.");
  } catch {
    setState("Idle");
    setStatus("Reload the X broadcast or /livechat tab, then try again.");
  }
}

document.querySelector("#start").addEventListener("click", async () => {
  try {
    const options = await saveSettings();
    const response = await sendToActiveTab("ls-chat-x-start", options);
    setState(response?.mode === "select" ? "Selecting" : "Capturing");
    setStatus(response?.mode === "select" ? "Click the chat area in the X tab." : response?.status ?? "Capturing.");
  } catch (error) {
    setState("Error");
    setStatus(String(error.message || error));
  }
});

document.querySelector("#select").addEventListener("click", async () => {
  try {
    await saveSettings();
    await sendToActiveTab("ls-chat-x-select");
    setState("Selecting");
    setStatus("Click the chat area in the X tab.");
  } catch (error) {
    setState("Error");
    setStatus(String(error.message || error));
  }
});

document.querySelector("#stop").addEventListener("click", async () => {
  try {
    await sendToActiveTab("ls-chat-x-stop");
    setState("Stopped");
    setStatus("Capture stopped.");
  } catch (error) {
    setState("Error");
    setStatus(String(error.message || error));
  }
});

loadSettings().then(refreshStatus);
