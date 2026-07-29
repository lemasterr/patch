import * as SecureStore from "expo-secure-store";

const key = "patch.push-token.v1";

export function getRegisteredPushToken() {
  return SecureStore.getItemAsync(key);
}

export function setRegisteredPushToken(token: string) {
  return SecureStore.setItemAsync(key, token);
}

export function clearRegisteredPushToken() {
  return SecureStore.deleteItemAsync(key);
}
