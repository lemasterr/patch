import { authLinkMessage, parseAuthLink } from "../auth-link";

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
});
