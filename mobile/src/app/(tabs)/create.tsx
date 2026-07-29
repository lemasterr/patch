import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CategoryPickerSheet } from "@/components/category-picker-sheet";
import { DateField, todayDateOnly } from "@/components/date-field";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import {
  categoryLabels,
  palette,
  radius,
  rarityLabels,
  spacing,
  type,
} from "@/constants/theme";
import { trackProductEvent } from "@/lib/product-analytics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useOffline } from "@/providers/offline-provider";
import type { AchievementCategory, AchievementRarity } from "@/types/domain";

const rarities = [
  "common",
  "rare",
  "legendary",
] as const satisfies readonly AchievementRarity[];

function createUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

type CreatePatchResponse = {
  achievementId: string;
  jobId: string | null;
  generationStatus: string;
};

function errorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not create your Patch.";
  if (/network|fetch|offline/i.test(message))
    return "You are offline. Your Patch has been saved and will sync when you reconnect.";
  return message;
}

export default function CreateScreen() {
  const { session } = useAuth();
  const { enqueue } = useOffline();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<AchievementCategory>("travel");
  const [rarity, setRarity] = useState<AchievementRarity>("common");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [eventDate, setEventDate] = useState(todayDateOnly);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const operationId = useRef(createUuid());

  useEffect(() => {
    if (!session) return;
    void supabase
      .from("user_settings")
      .select("default_visibility")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setVisibility(data.default_visibility);
      });
  }, [session]);

  function validateCurrentStep() {
    if (step !== 1) return true;
    if (title.trim().length >= 2 && description.trim().length >= 3) return true;
    setMessage("Add a short name and a few words about your Patch.");
    return false;
  }

  function goForward() {
    setMessage(null);
    if (!validateCurrentStep()) return;
    void Haptics.selectionAsync();
    setStep((current) => Math.min(3, current + 1));
  }

  async function submit() {
    if (!session || title.trim().length < 2 || description.trim().length < 3) {
      setStep(1);
      setMessage("Add a short name and a few words about your Patch.");
      return;
    }
    setBusy(true);
    setMessage(null);
    void trackProductEvent("create_started").catch(() => undefined);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        category,
        rarity,
        visibility,
        lifecycleStatus: "completed",
        eventDate,
        targetDate: null,
        idempotencyKey: operationId.current,
      };
      const { data, error } =
        await supabase.functions.invoke<CreatePatchResponse>(
          "create-achievement",
          { body },
        );
      if (error) throw error;
      if (!data?.achievementId)
        throw new Error("The Patch service returned no result.");

      void trackProductEvent("create_completed", data.achievementId).catch(
        () => undefined,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      operationId.current = createUuid();
      router.replace(`/reveal/${data.achievementId}`);
    } catch (error) {
      const networkError = /network|fetch|offline/i.test(
        error instanceof Error ? error.message : "",
      );
      if (!networkError) {
        setMessage(errorMessage(error));
      } else {
        try {
          await enqueue({
            id: createUuid(),
            operationType: "create_patch",
            idempotencyKey: operationId.current,
            payload: {
              title: title.trim(),
              description: description.trim(),
              category,
              rarity,
              visibility,
              lifecycleStatus: "completed",
              eventDate,
              targetDate: null,
              idempotencyKey: operationId.current,
            },
          });
          setQueued(true);
          setMessage(errorMessage(error));
        } catch {
          setMessage(
            "Could not save your Patch offline. Try again when connected.",
          );
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PatchHeader title="Create a Patch" showNotifications={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StepProgress step={step} />
        {step === 1 ? (
          <View style={styles.form}>
            <Text style={styles.heading}>What happened?</Text>
            <Text style={styles.intro}>
              Give this moment a name, then tell its story in your own words.
            </Text>
            <Field
              label="Name"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              autoFocus
            />
            <Field
              label="Bio"
              value={description}
              onChangeText={setDescription}
              maxLength={600}
              multiline
            />
          </View>
        ) : null}
        {step === 2 ? (
          <View style={styles.form}>
            <Text style={styles.heading}>Make it yours</Text>
            <Text style={styles.intro}>
              These details help people understand and discover your Patch.
            </Text>
            <Text style={styles.label}>Category</Text>
            <Pressable
              accessibilityLabel="Choose Patch category"
              onPress={() => setCategoryPickerOpen(true)}
              style={styles.categoryButton}
            >
              <View>
                <Text style={styles.categoryName}>
                  {categoryLabels[category]}
                </Text>
                <Text style={styles.categoryHint}>
                  Choose from all categories
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                color={palette.inkMuted}
                size={22}
              />
            </Pressable>
            <Text style={styles.label}>Rarity</Text>
            <View style={styles.row}>
              {rarities.map((value) => (
                <Choice
                  key={value}
                  label={rarityLabels[value]}
                  selected={value === rarity}
                  onPress={() => setRarity(value)}
                />
              ))}
            </View>
            <Text style={styles.label}>Visibility</Text>
            <View style={styles.row}>
              {(["public", "private"] as const).map((value) => (
                <Choice
                  key={value}
                  label={value === "public" ? "Public" : "Private"}
                  selected={value === visibility}
                  onPress={() => setVisibility(value)}
                />
              ))}
            </View>
          </View>
        ) : null}
        {step === 3 ? (
          <View style={styles.form}>
            <Text style={styles.heading}>When did it happen?</Text>
            <Text style={styles.intro}>
              Choose the date for this Patch. Patch never stores your location.
            </Text>
            <DateField
              label="Date"
              value={eventDate}
              onChange={setEventDate}
              maximumDate={todayDateOnly()}
              accessibilityHint="Opens a wheel date picker."
            />
          </View>
        ) : null}
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {step > 1 ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy || queued}
              onPress={() => {
                setMessage(null);
                setStep((current) => current - 1);
              }}
              style={styles.back}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              step === 3 ? "Create and generate Patch" : "Next step"
            }
            disabled={busy || queued}
            onPress={() => (step === 3 ? void submit() : goForward())}
            style={[styles.next, (busy || queued) && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={styles.nextText}>
                {queued
                  ? "Saved for sync"
                  : step === 3
                    ? "Create & generate"
                    : "Next"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
      <CategoryPickerSheet
        visible={categoryPickerOpen}
        value={category}
        onClose={() => setCategoryPickerOpen(false)}
        onSelect={(value) => {
          if (value !== "all") setCategory(value);
        }}
      />
    </Screen>
  );
}

function StepProgress({ step }: { step: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step }}
    >
      <View style={styles.stepCopy}>
        <Text style={styles.stepLabel}>STEP {step} OF 3</Text>
        <Text style={styles.stepTitle}>
          {step === 1 ? "Story" : step === 2 ? "Details" : "Date"}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        {[1, 2, 3].map((value) => (
          <View
            key={value}
            style={[
              styles.progressSegment,
              value <= step && styles.progressSegmentActive,
            ]}
          />
        ))}
      </View>
    </View>
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
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceActive]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: 120,
  },
  stepCopy: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stepLabel: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  stepTitle: { color: palette.inkMuted, fontSize: 12, fontWeight: "800" },
  progressTrack: { flexDirection: "row", gap: 5, marginTop: spacing.xs },
  progressSegment: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flex: 1,
    height: 5,
  },
  progressSegmentActive: { backgroundColor: palette.blue },
  form: { gap: spacing.md },
  heading: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 28,
    fontWeight: "900",
  },
  intro: {
    color: palette.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -spacing.xs,
  },
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
  description: { minHeight: 132, paddingTop: spacing.sm },
  categoryButton: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: spacing.md,
  },
  categoryName: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 16,
    fontWeight: "900",
  },
  categoryHint: { color: palette.inkMuted, fontSize: 11, marginTop: 2 },
  row: { flexDirection: "row", gap: spacing.xs },
  choice: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  choiceActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  choiceText: { color: palette.inkMuted, fontSize: 12, fontWeight: "800" },
  choiceTextActive: { color: palette.white },
  message: { color: palette.red, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: "auto" },
  back: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  backText: { color: palette.ink, fontSize: 16, fontWeight: "900" },
  next: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 54,
  },
  nextText: { color: palette.white, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.65 },
});
