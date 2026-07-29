import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import patchAvatar from "@/assets/images/patch-avatar.webp";
import { palette } from "@/constants/theme";

export function Avatar({
  size = 44,
  avatarKey,
}: {
  size?: number;
  avatarKey?: string | null;
}) {
  return (
    <View
      style={[
        styles.shell,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Image
        alt={avatarKey ? `${avatarKey} avatar` : "Patch avatar"}
        source={patchAvatar}
        contentFit="cover"
        style={{
          width: size - 4,
          height: size - 4,
          borderRadius: (size - 4) / 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
});
