import { formatDateOnly } from "../date-field";

describe("date-only serialization", () => {
  it("uses local calendar values rather than a UTC-shifted ISO date", () => {
    expect(formatDateOnly(new Date(2026, 0, 2, 0, 30))).toBe("2026-01-02");
  });
});
