import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // Personal Apple development teams cannot sign an app that has the APNs
  // entitlement. Keep it on for ordinary/EAS builds, but let a local Xcode
  // build opt out without changing the production configuration.
  const remotePushEnabled = process.env.PATCH_ENABLE_PUSH_NOTIFICATIONS !== "0";
  const notificationsPlugin: [string, Record<string, string>] = [
    "expo-notifications",
    {
      icon: "./assets/images/android-icon-monochrome.png",
      color: "#4A7DB7",
      defaultChannel: "patch",
    },
  ];

  return {
    ...config,
    name: "Patch",
    slug: "patch",
    version: "0.2.1",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "patch",
    userInterfaceStyle: "automatic",
    extra: {
      ...config.extra,
      remotePushEnabled,
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
    ios: {
      appleTeamId: "765W8A9Q4K",
      bundleIdentifier: "app.patch.mobile",
      supportsTablet: false,
      // Explicitly opt in to the iOS 26 design rather than the temporary UI
      // compatibility mode. The native GlassView availability check verifies
      // this setting in the compiled application.
      infoPlist: {
        UIDesignRequiresCompatibility: false,
      },
    },
    android: {
      package: "app.patch.mobile",
      predictiveBackGestureEnabled: true,
      adaptiveIcon: {
        backgroundColor: "#EAF2FB",
        foregroundImage: "./assets/images/icon.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
    },
    plugins: [
      "expo-router",
      "expo-dev-client",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#08131E",
          // iOS splash derivates need a PNG source. Runtime mascot media uses WebP.
          image: "./assets/images/patch-mascot-greeting-splash.png",
          imageWidth: 164,
        },
      ],
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
        },
      ],
      ...(remotePushEnabled ? [notificationsPlugin] : []),
      "./plugins/with-android-theme-palette",
      "./plugins/with-ios-build-hygiene",
      ...(remotePushEnabled ? [] : ["./plugins/without-ios-remote-push"]),
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
