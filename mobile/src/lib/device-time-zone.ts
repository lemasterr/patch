/** Returns the device's IANA zone, with a safe server-compatible fallback. */
export function getDeviceTimeZone() {
  try {
    const timeZone =
      globalThis.Intl?.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone?.trim() || "UTC";
  } catch {
    return "UTC";
  }
}
