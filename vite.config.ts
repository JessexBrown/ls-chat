import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function hostnameFromEnvUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function devAllowedHosts() {
  const explicitHosts = (process.env.DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const hostsFromIntegrationUrls = [
    hostnameFromEnvUrl(process.env.KICK_REDIRECT_URI),
    hostnameFromEnvUrl(process.env.KICK_WEBHOOK_URL)
  ].filter((host): host is string => Boolean(host));

  return Array.from(new Set([...explicitHosts, ...hostsFromIntegrationUrls]));
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    allowedHosts: devAllowedHosts(),
    host: "127.0.0.1",
    port: 5173
  }
});
