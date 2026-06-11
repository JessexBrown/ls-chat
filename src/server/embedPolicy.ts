export function parseEmbedAllowedOrigins(value: string | undefined) {
  const seen = new Set<string>();
  const origins = (value ?? "")
    .split(/[,\n]/)
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => origin !== "'self'" && origin.toLowerCase() !== "self")
    .filter((origin) => {
      if (seen.has(origin)) {
        return false;
      }

      seen.add(origin);
      return true;
    });

  return origins;
}

export function frameAncestorsDirective(origins: string[]) {
  return `frame-ancestors 'self'${origins.length > 0 ? ` ${origins.join(" ")}` : ""}`;
}

export function securityHeaderSnapshot(origins: string[]) {
  return {
    embedAllowedOrigins: origins,
    frameAncestors: frameAncestorsDirective(origins)
  };
}
