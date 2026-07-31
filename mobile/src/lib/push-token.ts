import * as SecureStore from "expo-secure-store";

const installationKey = "patch.push-installation.v1";
const registrationKey = "patch.push-registration.v2";
const pendingDisableKey = "patch.push-disable-pending.v1";
const pendingRefreshKey = "patch.push-refresh-pending.v1";

export type PushRegistration = {
  installationId: string;
  ownerId: string;
  expoPushToken: string;
};

export type PendingPushDisable = Pick<
  PushRegistration,
  "installationId" | "ownerId"
>;

function createInstallationId() {
  // This identifier is only an opaque installation handle. Authorization is
  // still enforced by the authenticated server RPC, so it is not a credential.
  const random = Math.random().toString(36).slice(2);
  return `install-${Date.now().toString(36)}-${random}`.slice(0, 96);
}

function parse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function getPushInstallationId() {
  const existing = await SecureStore.getItemAsync(installationKey);
  if (existing && /^[a-z0-9][a-z0-9-]{15,95}$/.test(existing)) {
    return existing;
  }
  const installationId = createInstallationId();
  await SecureStore.setItemAsync(installationKey, installationId);
  return installationId;
}

export async function getRegisteredPushDevice(): Promise<PushRegistration | null> {
  const registration = parse<PushRegistration>(
    await SecureStore.getItemAsync(registrationKey),
  );
  if (
    !registration ||
    !/^[a-z0-9][a-z0-9-]{15,95}$/.test(registration.installationId) ||
    !registration.ownerId ||
    !registration.expoPushToken
  ) {
    return null;
  }
  return registration;
}

export async function setRegisteredPushDevice(registration: PushRegistration) {
  await SecureStore.setItemAsync(registrationKey, JSON.stringify(registration));
}

export async function clearRegisteredPushToken() {
  await SecureStore.deleteItemAsync(registrationKey);
}

export async function recordPendingPushDisable(pending: PendingPushDisable) {
  await SecureStore.setItemAsync(pendingDisableKey, JSON.stringify(pending));
}

export async function getPendingPushDisable(): Promise<PendingPushDisable | null> {
  const pending = parse<PendingPushDisable>(
    await SecureStore.getItemAsync(pendingDisableKey),
  );
  if (
    !pending ||
    !pending.ownerId ||
    !/^[a-z0-9][a-z0-9-]{15,95}$/.test(pending.installationId)
  ) {
    return null;
  }
  return pending;
}

export function clearPendingPushDisable() {
  return SecureStore.deleteItemAsync(pendingDisableKey);
}

export function markPushTokenRefreshPending() {
  return SecureStore.setItemAsync(pendingRefreshKey, "1");
}

export function clearPushTokenRefreshPending() {
  return SecureStore.deleteItemAsync(pendingRefreshKey);
}

export function isPushTokenRefreshPending() {
  return SecureStore.getItemAsync(pendingRefreshKey).then(Boolean);
}
