export type PublicOnlyRouteAction = "allow" | "block" | "redirect";

export function isPublicOnlyMode(env: NodeJS.ProcessEnv) {
  return env.PUBLIC_LIVE_ONLY === "true" || env.MARKETBUBBLE_PUBLIC_ONLY === "true" || env.APP_MODE === "public";
}

export function publicOnlyRouteAction(input: { method: string; path: string; accept?: string | null }): PublicOnlyRouteAction {
  const method = input.method.toUpperCase();
  const path = normalizePath(input.path);

  if (path.startsWith("/api/")) {
    return publicViewerApiAllowed(method, path) ? "allow" : "block";
  }

  if (isStaticAssetPath(path)) {
    return "allow";
  }

  if ((method === "GET" || method === "HEAD") && acceptsHtml(input.accept) && !isPublicViewerPath(path)) {
    return "redirect";
  }

  return "allow";
}

export function isPublicViewerPath(path: string) {
  return path.startsWith("/live") || path.startsWith("/embed") || path.startsWith("/mock-marketbubble");
}

export function publicViewerApiAllowed(method: string, path: string) {
  if (method === "GET" && (path === "/api/public/config" || path === "/api/sources" || path === "/api/messages")) {
    return true;
  }

  if (path.startsWith("/api/emotes/betterttv/")) {
    return method === "GET";
  }

  if (path === "/api/native-chat/session") {
    return method === "GET";
  }

  if (path === "/api/native-chat/messages") {
    return method === "POST";
  }

  if (path === "/api/capture/x-live") {
    return method === "POST" || method === "OPTIONS";
  }

  if (path.startsWith("/api/webhooks/")) {
    return method === "POST";
  }

  return false;
}

function acceptsHtml(accept: string | null | undefined) {
  return !accept || accept.includes("text/html");
}

export function isStaticAssetPath(path: string) {
  return (
    path.startsWith("/assets/") ||
    path.startsWith("/src/") ||
    path.startsWith("/node_modules/") ||
    path.startsWith("/@") ||
    path === "/x-live-capture.js" ||
    /\.[a-z0-9]+$/i.test(path)
  );
}

export function normalizePath(path: string) {
  return path.split("?")[0].replace(/\/+$/, "") || "/";
}
