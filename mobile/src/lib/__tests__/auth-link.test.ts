import {
  authLinkMessage,
  isPatchAuthCallback,
  parseAuthLink,
} from "../auth-link";

describe("auth link parser", () => {
  it("parses PKCE recovery links", () => {
    expect(
      parseAuthLink("patch://auth/callback?code=abc&type=recovery"),
    ).toMatchObject({ code: "abc", intent: "recovery", error: null });
  });
  it("parses token links and provider errors without exposing tokens", () => {
    expect(
      parseAuthLink(
        "patch://auth/callback#access_token=access&refresh_token=refresh&type=signup",
      ),
    ).toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
      intent: "confirmation",
    });
    expect(
      authLinkMessage(
        parseAuthLink("patch://auth/callback?error_code=otp_expired").error,
      ),
    ).toContain("expired");
  });

  it("accepts only the exact native callback and handles malformed errors", () => {
    expect(isPatchAuthCallback("patch://auth/callback?code=abc")).toBe(true);
    expect(isPatchAuthCallback("https://auth/callback?code=abc")).toBe(false);
    expect(isPatchAuthCallback("patch://profile/callback?code=abc")).toBe(
      false,
    );
    expect(
      parseAuthLink("patch://auth/callback?error_description=%").error,
    ).toBe("%");
    expect(authLinkMessage("This link was already used.")).toContain(
      "expired or was already used",
    );
  });
});
