import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: "Patch",
    slug: "patch",
    version: "0.2.0",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "patch",
    userInterfaceStyle: "automatic",
    extra: {
      ...config.extra,
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
    ios: {
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
          faceIDPermission: "Allow Patch to use Face ID for secure access.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/android-icon-monochrome.png",
          color: "#4A7DB7",
          defaultChannel: "patch",
          enableBackgroundRemoteNotifications: true,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
