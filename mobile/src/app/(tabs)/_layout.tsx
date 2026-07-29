import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform, StyleSheet } from "react-native";

import { CompactTabBar } from "@/components/compact-tab-bar";
import { palette } from "@/constants/theme";

function AppTabs() {
  return (
    <Tabs
      initialRouteName="discover"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
      }}
      tabBar={(props) => <CompactTabBar {...props} />}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: "New Patch",
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: "My Patch",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  // The custom bar remains on Android, where it preserves Patch's compact
  // layout. iOS gets the system tab bar so its selected item, press response,
  // morphing and Liquid Glass physics all come from UIKit rather than a
  // simulated circle in JavaScript.
  return Platform.OS === "ios" ? <NativeAppTabs /> : <AppTabs />;
}

function NativeAppTabs() {
  return (
    <NativeTabs
      iconColor={{ default: palette.inkMuted, selected: palette.white }}
      minimizeBehavior="never"
    >
      <NativeTabs.Trigger
        accessibilityLabel="Discover"
        disableAutomaticContentInsets
        name="discover"
      >
        <NativeTabs.Trigger.Icon
          src={
            <NativeTabs.Trigger.VectorIcon
              family={MaterialCommunityIcons}
              name="cards"
            />
          }
        />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        accessibilityLabel="Map"
        disableAutomaticContentInsets
        name="map"
      >
        <NativeTabs.Trigger.Icon sf="map" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        accessibilityLabel="New Patch"
        disableAutomaticContentInsets
        name="create"
      >
        <NativeTabs.Trigger.Icon sf="plus.circle" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        accessibilityLabel="My Patch"
        disableAutomaticContentInsets
        name="collection"
      >
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        accessibilityLabel="Profile"
        disableAutomaticContentInsets
        name="profile"
      >
        <NativeTabs.Trigger.Icon sf="person.crop.circle" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    display: "none",
  },
});
