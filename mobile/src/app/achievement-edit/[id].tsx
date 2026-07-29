import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { DateField, todayDateOnly } from "@/components/date-field";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import {
  categoryLabels,
  palette,
  radius,
  rarityLabels,
  spacing,
} from "@/constants/theme";
import { getAchievement } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import type {
  Achievement,
  AchievementCategory,
  AchievementRarity,
} from "@/types/domain";

const categories = Object.keys(categoryLabels) as AchievementCategory[];
const rarities = [
  "common",
  "rare",
  "legendary",
] as const satisfies readonly AchievementRarity[];

function operationId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

export default function AchievementEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patch, setPatch] = useState<Achievement | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<AchievementCategory>("other");
  const [rarity, setRarity] = useState<AchievementRarity>("common");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [eventDate, setEventDate] = useState(todayDateOnly);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void getAchievement(id)
      .then((item) => {
        if (!mounted || !item) return;
        setPatch(item);
        setTitle(item.title);
        setDescription(item.description);
        setCategory(item.category);
        setRarity(item.rarity);
        setVisibility(item.visibility);
        setEventDate(item.achievement_date);
      })
      .catch(() => setMessage("Could not load this Patch."))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  async function save() {
    if (!patch || title.trim().length < 2 || description.trim().length < 3) {
      setMessage("Add a name and description before saving.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const pOperationId = operationId();
    const result =
      patch.source_kind === "user"
        ? await supabase.rpc("update_user_patch", {
            p_patch_id: patch.id,
            p_title: title.trim(),
            p_description: description.trim(),
            p_category: category,
            p_rarity: rarity,
            p_visibility: visibility,
            p_event_date: eventDate,
            // Lifecycle is no longer editable in the product. Keep the v2
            // argument concrete for compatible older server signatures.
            p_target_date: eventDate,
            p_operation_id: pOperationId,
          })
        : await supabase.rpc("update_system_travel_patch", {
            p_patch_id: patch.id,
            p_description: description.trim(),
            p_date: eventDate,
            p_operation_id: pOperationId,
          });
    if (result.error) {
      setSaving(false);
      setMessage("Could not save this Patch. Please try again.");
      return;
    }
    router.replace(`/achievement/${patch.id}`);
  }

  if (loading) {
    return (
      <Screen>
        <PatchHeader back title="Edit Patch" showNotifications={false} />
        <ActivityIndicator
          style={styles.loader}
          color={palette.blue}
          size="large"
        />
      </Screen>
    );
  }
  if (!patch) {
    return (
      <Screen>
        <PatchHeader back title="Patch unavailable" showNotifications={false} />
        <Text style={styles.unavailable}>
          This Patch is no longer available.
        </Text>
      </Screen>
    );
  }
  const systemPatch = patch.source_kind !== "user";

  return (
    <Screen>
      <PatchHeader
        back
        title={systemPatch ? "Edit travel Patch" : "Edit Patch"}
        showNotifications={false}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {systemPatch ? (
          <Text style={styles.notice}>
            Travel Patches keep their earned title, category, rarity, and
            visibility. You can personalise the description and date.
          </Text>
        ) : null}
        <View style={styles.form}>
          {systemPatch ? (
            <Text style={styles.lockedTitle}>{title}</Text>
          ) : (
            <Field
              label="Name"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          )}
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            maxLength={600}
            multiline
          />
          {!systemPatch ? (
            <>
              <Text style={styles.label}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {categories.map((value) => (
                  <Choice
                    key={value}
                    label={categoryLabels[value]}
                    selected={category === value}
                    onPress={() => setCategory(value)}
                  />
                ))}
              </ScrollView>
              <Text style={styles.label}>Rarity</Text>
              <View style={styles.row}>
                {rarities.map((value) => (
                  <Choice
                    key={value}
                    label={rarityLabels[value]}
                    selected={rarity === value}
                    onPress={() => setRarity(value)}
                    compact
                  />
                ))}
              </View>
            </>
          ) : null}
          <DateField
            label="Event date"
            value={eventDate}
            onChange={setEventDate}
            maximumDate={todayDateOnly()}
          />
          {!systemPatch ? (
            <>
              <Text style={styles.label}>Visibility</Text>
              <View style={styles.row}>
                {(["public", "private"] as const).map((value) => (
                  <Choice
                    key={value}
                    label={value === "public" ? "Public" : "Private"}
                    selected={visibility === value}
                    onPress={() => setVisibility(value)}
                    compact
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : null}
        <Pressable
          disabled={saving}
          onPress={() => void save()}
          style={[styles.save, saving && styles.disabled]}
        >
          {saving ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <Text style={styles.saveText}>Save changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Field({
  label,
  multiline,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={palette.inkMuted}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.description]}
        {...props}
      />
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        compact && styles.choiceCompact,
        selected && styles.choiceActive,
      ]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: "45%" },
  unavailable: {
    color: palette.inkMuted,
    margin: spacing.lg,
    textAlign: "center",
  },
  content: { gap: spacing.lg, padding: spacing.lg, paddingBottom: 80 },
  form: { gap: spacing.md },
  notice: { color: palette.inkMuted, fontSize: 13, lineHeight: 19 },
  lockedTitle: { color: palette.ink, fontSize: 18, fontWeight: "900" },
  field: { gap: spacing.xs },
  label: { color: palette.inkMuted, fontSize: 12, fontWeight: "800" },
  input: {
    borderBottomWidth: 1,
    borderColor: palette.border,
    color: palette.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: spacing.xs,
  },
  description: { minHeight: 110, paddingTop: spacing.sm },
  chips: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.xs },
  choice: {
    borderColor: palette.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  choiceCompact: { alignItems: "center", flex: 1 },
  choiceActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  choiceText: { color: palette.inkMuted, fontSize: 13, fontWeight: "800" },
  choiceTextActive: { color: palette.white },
  message: { color: palette.red, fontSize: 13 },
  save: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 54,
  },
  saveText: { color: palette.white, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.65 },
});
