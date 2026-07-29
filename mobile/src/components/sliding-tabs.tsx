import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { palette, spacing, type } from "@/constants/theme";

type TabOption<T extends string> = { value: T; label: string };

export function SlidingTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly TabOption<T>[];
  onChange: (value: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const tabWidth = width / options.length;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: index,
      stiffness: 240,
      damping: 26,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }, [index, progress]);

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.root}
    >
      {width ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: tabWidth,
              transform: [
                { translateX: Animated.multiply(progress, tabWidth) },
              ],
            },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={styles.tab}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 48,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  indicator: {
    position: "absolute",
    bottom: -StyleSheet.hairlineWidth,
    height: 2,
    borderRadius: 1,
    backgroundColor: palette.blueBright,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: {
    color: palette.inkMuted,
    fontFamily: type.rounded,
    fontSize: 14,
    fontWeight: "900",
    paddingHorizontal: spacing.xs,
  },
  textActive: { color: palette.ink },
});
