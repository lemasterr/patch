export type AuthLinkIntent = "recovery" | "confirmation" | "unknown";

export type ParsedAuthLink = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  intent: AuthLinkIntent;
  error: string | null;
};

export function isPatchAuthCallback(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "patch:" &&
      parsed.hostname === "auth" &&
      parsed.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

export function parseAuthLink(url: string): ParsedAuthLink {
  const parsed = new URL(url);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const get = (name: string) => parsed.searchParams.get(name) ?? hash.get(name);
  const rawIntent = get("type");
  const error = get("error_description") ?? get("error_code") ?? get("error");
  let decodedError: string | null = null;
  if (error) {
    try {
      decodedError = decodeURIComponent(error.replace(/\+/g, " "));
    } catch {
      decodedError = error;
    }
  }
  return {
    code: parsed.searchParams.get("code"),
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    intent:
      rawIntent === "recovery"
        ? "recovery"
        : rawIntent === "signup" || rawIntent === "email_change"
          ? "confirmation"
          : "unknown",
    error: decodedError,
  };
}

export function authLinkMessage(error: string | null) {
  if (!error) return null;
  const normalized = error.toLocaleLowerCase();
  if (normalized.includes("expired") || normalized.includes("used"))
    return "This link has expired or was already used. Request a new one.";
  return "This sign-in link could not be completed. Request a new link or return to sign in.";
}
