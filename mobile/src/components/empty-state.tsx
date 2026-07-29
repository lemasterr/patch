import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { palette, spacing, type } from "@/constants/theme";

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  body: string;
}) {
  return (
    <View style={styles.root}>
      <MaterialCommunityIcons name={icon} size={38} color={palette.blue} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  title: {
    marginTop: spacing.md,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 19,
    fontWeight: "800",
  },
  body: {
    marginTop: spacing.xs,
    maxWidth: 290,
    color: palette.inkMuted,
    fontFamily: type.regular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
