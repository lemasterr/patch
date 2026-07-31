import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, Text, View } from "react-native";

import { palette, spacing, type } from "@/constants/theme";

export function FeatureUnavailable({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View accessibilityRole="alert" style={styles.root}>
      <MaterialCommunityIcons
        name="progress-wrench"
        color={palette.blue}
        size={38}
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
  },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 19,
    fontWeight: "800",
    marginTop: spacing.md,
    textAlign: "center",
  },
  body: {
    color: palette.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
    maxWidth: 300,
    textAlign: "center",
  },
});
