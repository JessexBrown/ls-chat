import type { IntegrationStatusStore } from "./status";

type KickSubscribeOptions = {
  accessToken: string;
  broadcasterUserId?: string | null;
  statuses: IntegrationStatusStore;
};

export async function subscribeKickChatWebhook(options: KickSubscribeOptions) {
  options.statuses.set("kick", "connecting", "Creating Kick chat.message.sent webhook subscription.");

  const requestBody: {
    events: Array<{ name: string; version: number }>;
    method: "webhook";
    broadcaster_user_id?: number;
  } = {
    events: [
      {
        name: "chat.message.sent",
        version: 1
      }
    ],
    method: "webhook"
  };

  if (options.broadcasterUserId) {
    requestBody.broadcaster_user_id = Number(options.broadcasterUserId);
  }

  const response = await fetch("https://api.kick.com/public/v1/events/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kick subscription failed with ${response.status}: ${body}`);
  }

  const body = await response.json();
  options.statuses.set("kick", "subscribed", "Subscribed to Kick chat.message.sent webhook events.");
  return body;
}
