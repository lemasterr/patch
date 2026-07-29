import { resolveThemePreference } from "@/lib/theme";

describe("theme resolution", () => {
  it("honours explicit choices and resolves system appearance safely", () => {
    expect(resolveThemePreference("light", "dark")).toBe("light");
    expect(resolveThemePreference("dark", "light")).toBe("dark");
    expect(resolveThemePreference("system", "light")).toBe("light");
    expect(resolveThemePreference("system", null)).toBe("dark");
  });
});
