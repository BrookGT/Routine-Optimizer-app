import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAppTheme } from "../context/ThemeContext";
import {
    createReminder,
    updateReminder,
    syncReminderNotificationsWithServer,
} from "../api/reminderApi";
import { getApiErrorMessage } from "../utils/api";
import { formatCategoryLabel } from "../services/customReminderService";

const CATEGORY_KEYS = [
    "events",
    "gym_workout",
    "prayer",
    "meeting",
    "study",
    "medication",
    "work",
    "routine_activity",
    "travel",
    "shopping",
    "appointment",
    "entertainment",
    "custom",
];

const REPEAT_KEYS = [
    { key: "once", label: "One time" },
    { key: "daily", label: "Daily" },
    { key: "weekdays", label: "Weekdays" },
    { key: "weekends", label: "Weekends" },
    { key: "custom", label: "Custom days" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymdFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function hmFromDate(d) {
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

function parseYmdToDate(s, timeFallback) {
    const [y, mo, da] = String(s).split("-").map(Number);
    const [hh, mm] = timeFallback.split(":").map(Number);
    return new Date(y, mo - 1, da, hh || 9, mm || 0, 0, 0);
}

function nextDefaultDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
}

export default function ReminderEditorScreen({ navigation, route }) {
    const existing = route.params?.reminder;
    const suggestedCategory = route.params?.suggestedCategory;
    const isEdit = Boolean(existing?.id);

    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );

    const [title, setTitle] = useState(existing?.title ?? "");
    const [description, setDescription] = useState(existing?.description ?? "");
    const [category, setCategory] = useState(
        existing?.category ?? suggestedCategory ?? "routine_activity",
    );
    const [customLabel, setCustomLabel] = useState(
        existing?.customCategoryLabel ?? "",
    );
    const [repeatType, setRepeatType] = useState(
        existing?.repeat?.type ?? "once",
    );
    const [customDays, setCustomDays] = useState(
        () =>
            existing?.repeat?.type === "custom" && Array.isArray(existing?.repeat?.customDays)
                ? [...existing.repeat.customDays]
                : [],
    );

    const initialDate = useMemo(() => {
        if (existing?.date && existing?.time) {
            return parseYmdToDate(existing.date, existing.time);
        }
        return nextDefaultDate();
    }, [existing]);

    const [dateVal, setDateVal] = useState(initialDate);
    const [pickerMode, setPickerMode] = useState(null);

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (suggestedCategory && CATEGORY_KEYS.includes(suggestedCategory)) {
            setCategory(suggestedCategory);
        }
    }, [suggestedCategory]);

    useEffect(() => {
        if (repeatType !== "custom" && customDays.length) {
            setCustomDays([]);
        }
    }, [repeatType]);

    function toggleDay(d) {
        setCustomDays((prev) =>
            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
        );
    }

    const displayTimeLabel = useMemo(
        () =>
            dateVal.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
            }),
        [dateVal],
    );

    const displayDateLabel = useMemo(
        () =>
            dateVal.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
            }),
        [dateVal],
    );

    const save = useCallback(async () => {
        if (!title.trim()) {
            Alert.alert("Reminder", "Please enter a title.");
            return;
        }
        if (category === "custom" && !customLabel.trim()) {
            Alert.alert("Reminder", "Enter a name for your custom category.");
            return;
        }
        if (repeatType === "custom" && customDays.length === 0) {
            Alert.alert(
                "Reminder",
                "Pick at least one day for a custom repeat.",
            );
            return;
        }

        const body = {
            title: title.trim(),
            description: description.trim(),
            category,
            customCategoryLabel:
                category === "custom" ? customLabel.trim() : null,
            date: ymdFromDate(dateVal),
            time: hmFromDate(dateVal),
            repeat: {
                type: repeatType,
                customDays: repeatType === "custom" ? customDays : null,
            },
            enabled: existing?.enabled !== false,
        };

        try {
            setSaving(true);
            if (isEdit) {
                await updateReminder(existing.id, body);
            } else {
                await createReminder(body);
            }
            await syncReminderNotificationsWithServer();
            navigation.goBack();
        } catch (e) {
            Alert.alert("Save failed", getApiErrorMessage(e));
        } finally {
            setSaving(false);
        }
    }, [
        title,
        description,
        category,
        customLabel,
        dateVal,
        repeatType,
        customDays,
        isEdit,
        existing,
        navigation,
    ]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <LinearGradient colors={gradients.appBackground} style={styles.grad}>
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
                        <Text style={styles.cancel}>Cancel</Text>
                    </Pressable>
                    <Text style={styles.headerTitle}>
                        {isEdit ? "Edit reminder" : "New reminder"}
                    </Text>
                    <Pressable onPress={save} disabled={saving} hitSlop={10}>
                        {saving ? (
                            <ActivityIndicator size="small" color={palette.mint} />
                        ) : (
                            <Text style={styles.save}>Save</Text>
                        )}
                    </Pressable>
                </View>

                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.label}>Title</Text>
                    <TextInput
                        style={styles.input}
                        value={title}
                        onChangeText={setTitle}
                        placeholder="What should we remind you?"
                        placeholderTextColor={palette.textMuted}
                    />

                    <Text style={styles.label}>Note (optional)</Text>
                    <TextInput
                        style={[styles.input, styles.multiline]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Extra detail…"
                        placeholderTextColor={palette.textMuted}
                        multiline
                    />

                    <Text style={styles.label}>Category</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.catRow}
                    >
                        {CATEGORY_KEYS.map((k) => {
                            const active = category === k;
                            return (
                                <Pressable
                                    key={k}
                                    onPress={() => setCategory(k)}
                                    style={[
                                        styles.catChip,
                                        active && styles.catChipOn,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.catChipText,
                                            active && styles.catChipTextOn,
                                        ]}
                                    >
                                        {formatCategoryLabel(k)}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    {category === "custom" ? (
                        <>
                            <Text style={styles.label}>Custom category name</Text>
                            <TextInput
                                style={styles.input}
                                value={customLabel}
                                onChangeText={setCustomLabel}
                                placeholder="e.g. Water plants"
                                placeholderTextColor={palette.textMuted}
                            />
                        </>
                    ) : null}

                    <Text style={styles.label}>When</Text>
                    <Pressable
                        style={styles.rowBtn}
                        onPress={() => setPickerMode("date")}
                    >
                        <Ionicons
                            name="calendar-outline"
                            size={20}
                            color={palette.oceanBlue}
                        />
                        <Text style={styles.rowText}>{displayDateLabel}</Text>
                        <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={palette.textMuted}
                        />
                    </Pressable>
                    <Pressable
                        style={styles.rowBtn}
                        onPress={() => setPickerMode("time")}
                    >
                        <Ionicons
                            name="time-outline"
                            size={20}
                            color={palette.oceanBlue}
                        />
                        <Text style={styles.rowText}>{displayTimeLabel}</Text>
                        <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={palette.textMuted}
                        />
                    </Pressable>

                    {pickerMode === "date" ? (
                        <DateTimePicker
                            value={dateVal}
                            mode="date"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            onChange={(_, d) => {
                                if (Platform.OS === "android") {
                                    setPickerMode(null);
                                }
                                if (d) {
                                    const next = new Date(dateVal);
                                    next.setFullYear(
                                        d.getFullYear(),
                                        d.getMonth(),
                                        d.getDate(),
                                    );
                                    setDateVal(next);
                                }
                            }}
                            themeVariant={isDark ? "dark" : "light"}
                        />
                    ) : null}
                    {pickerMode === "time" ? (
                        <DateTimePicker
                            value={dateVal}
                            mode="time"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            onChange={(_, d) => {
                                if (Platform.OS === "android") {
                                    setPickerMode(null);
                                }
                                if (d) {
                                    const next = new Date(dateVal);
                                    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                                    setDateVal(next);
                                }
                            }}
                            themeVariant={isDark ? "dark" : "light"}
                        />
                    ) : null}
                    {Platform.OS === "ios" && pickerMode ? (
                        <Pressable
                            style={styles.pickerDone}
                            onPress={() => setPickerMode(null)}
                        >
                            <Text style={styles.pickerDoneText}>Done</Text>
                        </Pressable>
                    ) : null}

                    <Text style={styles.label}>Repeat</Text>
                    <View style={styles.repeatGrid}>
                        {REPEAT_KEYS.map((r) => {
                            const on = repeatType === r.key;
                            return (
                                <Pressable
                                    key={r.key}
                                    style={[styles.repeatChip, on && styles.repeatOn]}
                                    onPress={() => setRepeatType(r.key)}
                                >
                                    <Text
                                        style={[
                                            styles.repeatText,
                                            on && styles.repeatTextOn,
                                        ]}
                                    >
                                        {r.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {repeatType === "custom" ? (
                        <>
                            <Text style={styles.label}>Days</Text>
                            <View style={styles.dayRow}>
                                {DAY_LABELS.map((lbl, idx) => {
                                    const on = customDays.includes(idx);
                                    return (
                                        <Pressable
                                            key={lbl}
                                            style={[styles.dayChip, on && styles.dayOn]}
                                            onPress={() => toggleDay(idx)}
                                        >
                                            <Text
                                                style={[
                                                    styles.dayText,
                                                    on && styles.dayTextOn,
                                                ]}
                                            >
                                                {lbl}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    ) : null}

                    <View style={{ height: 40 }} />
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: palette.pageTop },
        grad: { flex: 1 },
        header: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        cancel: { fontSize: 16, color: palette.textSecondary },
        headerTitle: {
            fontSize: 17,
            fontWeight: "800",
            color: palette.textPrimary,
        },
        save: { fontSize: 16, fontWeight: "800", color: palette.mint },
        scroll: { paddingHorizontal: 16, paddingBottom: 40 },
        label: {
            marginTop: 16,
            marginBottom: 6,
            fontSize: 12,
            fontWeight: "800",
            color: palette.textMuted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },
        input: {
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surface,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            color: palette.textPrimary,
        },
        multiline: { minHeight: 88, textAlignVertical: "top" },
        catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        catChip: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surface,
        },
        catChipOn: {
            backgroundColor: palette.mint,
            borderColor: palette.mint,
        },
        catChipText: {
            fontSize: 12,
            fontWeight: "700",
            color: palette.textSecondary,
        },
        catChipTextOn: { color: palette.iceWhite },
        rowBtn: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surface,
            marginBottom: 8,
        },
        rowText: {
            flex: 1,
            fontSize: 15,
            fontWeight: "600",
            color: palette.textPrimary,
        },
        pickerDone: { alignSelf: "flex-end", padding: 8 },
        pickerDoneText: { color: palette.oceanBlue, fontWeight: "700" },
        repeatGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        repeatChip: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surface,
        },
        repeatOn: {
            borderColor: palette.oceanBlue,
            backgroundColor: isDark
                ? "rgba(56,174,255,0.18)"
                : "rgba(56,174,255,0.12)",
        },
        repeatText: {
            fontSize: 12,
            fontWeight: "700",
            color: palette.textSecondary,
        },
        repeatTextOn: { color: palette.deepBlue },
        dayRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        dayChip: {
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surface,
        },
        dayOn: {
            backgroundColor: palette.mint,
            borderColor: palette.mint,
        },
        dayText: { fontSize: 11, fontWeight: "800", color: palette.textSecondary },
        dayTextOn: { color: palette.iceWhite },
    });
}
