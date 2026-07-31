const { withEntitlementsPlist } = require("expo/config-plugins");

// Expo SDK 57 automatically applies expo-notifications when the module is
// installed and consequently adds the APNs entitlement. A Personal Apple
// development team cannot sign that capability, so the local development
// profile opts out after Expo's automatic plugin has run. This is only added
// from app.config.ts when PATCH_ENABLE_PUSH_NOTIFICATIONS=0.
module.exports = function withoutIosRemotePush(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    delete modConfig.modResults["aps-environment"];
    return modConfig;
  });
};
