import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../context/ThemeContext";
import {
    deleteReminder,
    syncReminderNotificationsWithServer,
    toggleReminder,
} from "../api/reminderApi";
import { getApiErrorMessage } from "../utils/api";
import {
    formatCategoryLabel,
    deepLinkForReminderCategory,
} from "../services/customReminderService";
import { useSavedPlaces } from "../hooks/useSavedPlaces";

const REPEAT_LABEL = {
    once: "One time",
    daily: "Daily",
    weekdays: "Weekdays",
    weekends: "Weekends",
    custom: "Custom days",
};

function buildAiSuggestions(saved) {
    const hay = (saved || [])
        .map((p) => `${p.type ?? ""} ${p.name ?? ""}`.toLowerCase())
        .join(" ");
    const out = [];
    if (/gym|fitness|workout|barbell/.test(hay)) {
        out.push({
            key: "gym_workout",
            title: "Workout reminder",
            body: "You often save gym spots — set a training reminder.",
            icon: "barbell-outline",
        });
    }
    if (/event|concert|festival|venue/.test(hay)) {
        out.push({
            key: "events",
            title: "Events",
            body: "You follow events — never miss one.",
            icon: "calendar-outline",
        });
    }
    if (/church|orthodox|mosque|prayer|worship|cathedral/.test(hay)) {
        out.push({
            key: "prayer",
            title: "Prayer time",
            body: "Quiet moments that match your faith.",
            icon: "hand-left-outline",
        });
    }
    if (/study|library|workspace|laptop/.test(hay)) {
        out.push({
            key: "study",
            title: "Focus block",
            body: "Protect deep work with a study reminder.",
            icon: "school-outline",
        });
    }
    if (out.length === 0) {
        out.push({
            key: "routine_activity",
            title: "Routine check-in",
            body: "Anchor your day with a quick routine nudge.",
            icon: "checkmark-done-outline",
        });
    }
    return out.slice(0, 4);
}

function formatReminderDateTime(dateStr, timeStr) {
    try {
        const [y, m, d] = String(dateStr).split("-").map(Number);
        const [hh, mm] = String(timeStr).split(":").map(Number);
        const dt = new Date(y, m - 1, d, hh, mm);
        return dt.toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return `${dateStr} · ${timeStr}`;
    }
}

export default function RemindersScreen({ navigation }) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );

    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const { saved, loadSaved } = useSavedPlaces();
    const suggestions = useMemo(() => buildAiSuggestions(saved), [saved]);

    const load = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const rows = await syncReminderNotificationsWithServer();
            setList(rows);
        } catch (e) {
            if (!silent) {
                Alert.alert("Reminders", getApiErrorMessage(e));
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadSaved({ silent: true });
            load(true);
        }, [load, loadSaved]),
    );

    async function onRefresh() {
        try {
            setRefreshing(true);
            await load(true);
        } finally {
            setRefreshing(false);
        }
    }

    async function handleToggle(item) {
        try {
            await toggleReminder(item.id);
            await syncReminderNotificationsWithServer();
            await load(true);
        } catch (e) {
            Alert.alert("Unable to update", getApiErrorMessage(e));
        }
    }

    function confirmDelete(item) {
        Alert.alert(
            "Delete reminder",
            `Remove “${item.title}”? This cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteReminder(item.id);
                            await syncReminderNotificationsWithServer();
                            await load(true);
                        } catch (e) {
                            Alert.alert(
                                "Delete failed",
                                getApiErrorMessage(e),
                            );
                        }
                    },
                },
            ],
        );
    }

    function renderReminder({ item }) {
        const catLabel =
            item.category === "custom" && item.customCategoryLabel
                ? item.customCategoryLabel
                : formatCategoryLabel(item.category);
        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                            {item.title}
                        </Text>
                        <Switch
                            value={item.enabled}
                            onValueChange={() => handleToggle(item)}
                            trackColor={{
                                false: palette.borderSoft,
                                true: palette.mint,
                            }}
                            thumbColor={
                                item.enabled ? palette.iceWhite : palette.textMuted
                            }
                        />
                    </View>
                    <Text style={styles.cardMeta}>
                        {catLabel} · {REPEAT_LABEL[item.repeat?.type] ?? "—"}
                    </Text>
                    <Text style={styles.cardTime}>
                        {formatReminderDateTime(item.date, item.time)}
                    </Text>
                    {item.description ? (
                        <Text style={styles.cardDesc} numberOfLines={2}>
                            {item.description}
                        </Text>
                    ) : null}
                    <Text style={styles.cardDeep} numberOfLines={1}>
                        Opens: {deepLinkForReminderCategory(item.category)}
                    </Text>
                </View>
                <View style={styles.cardActions}>
                    <Pressable
                        style={styles.cardBtn}
                        onPress={() =>
                            navigation.navigate("ReminderEditor", {
                                reminder: item,
                            })
                        }
                    >
                        <Ionicons
                            name="pencil"
                            size={16}
                            color={palette.oceanBlue}
                        />
                        <Text style={styles.cardBtnText}>Edit</Text>
                    </Pressable>
                    <Pressable
                        style={styles.cardBtn}
                        onPress={() => confirmDelete(item)}
                    >
                        <Ionicons name="trash-outline" size={16} color={palette.danger} />
                        <Text style={[styles.cardBtnText, { color: palette.danger }]}>
                            Delete
                        </Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <LinearGradient colors={gradients.appBackground} style={styles.grad}>
                <View style={styles.header}>
                    <Pressable
                        style={styles.back}
                        onPress={() => navigation.goBack()}
                        hitSlop={10}
                    >
                        <Ionicons
                            name="arrow-back"
                            size={22}
                            color={palette.textPrimary}
                        />
                    </Pressable>
                    <Text style={styles.headerTitle}>Custom reminders</Text>
                    <Pressable
                        style={styles.addBtn}
                        onPress={() => navigation.navigate("ReminderEditor", {})}
                    >
                        <Ionicons name="add" size={26} color={palette.iceWhite} />
                    </Pressable>
                </View>

                <FlatList
                    data={list}
                    keyExtractor={(r) => r.id}
                    contentContainerStyle={styles.listPad}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                    ListHeaderComponent={
                        <View style={styles.suggestBlock}>
                            <Text style={styles.suggestEyebrow}>
                                Suggested for you
                            </Text>
                            <Text style={styles.suggestSub}>
                                Based on places you save and explore
                            </Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.suggestRow}
                            >
                                {suggestions.map((s) => (
                                    <Pressable
                                        key={s.key}
                                        style={styles.suggestChip}
                                        onPress={() =>
                                            navigation.navigate("ReminderEditor", {
                                                suggestedCategory: s.key,
                                            })
                                        }
                                    >
                                        <Ionicons
                                            name={s.icon}
                                            size={18}
                                            color={palette.oceanBlue}
                                        />
                                        <View style={{ flex: 1, minWidth: 120 }}>
                                            <Text style={styles.suggestTitle}>
                                                {s.title}
                                            </Text>
                                            <Text
                                                style={styles.suggestBody}
                                                numberOfLines={2}
                                            >
                                                {s.body}
                                            </Text>
                                        </View>
                                        <Ionicons
                                            name="chevron-forward"
                                            size={16}
                                            color={palette.textMuted}
                                        />
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>
                    }
                    ListEmptyComponent={
                        loading ? null : (
                            <Text style={styles.empty}>
                                No reminders yet. Tap + to create one.
                            </Text>
                        )
                    }
                    renderItem={renderReminder}
                />
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
            paddingHorizontal: 16,
            paddingVertical: 10,
            gap: 12,
        },
        back: {
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        headerTitle: {
            flex: 1,
            fontSize: 20,
            fontWeight: "800",
            color: palette.textPrimary,
        },
        addBtn: {
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.mint,
        },
        listPad: {
            paddingHorizontal: 16,
            paddingBottom: 120,
        },
        suggestBlock: {
            marginBottom: 18,
        },
        suggestEyebrow: {
            fontSize: 11,
            fontWeight: "800",
            color: palette.textMuted,
            textTransform: "uppercase",
            letterSpacing: 0.6,
        },
        suggestSub: {
            marginTop: 4,
            fontSize: 13,
            color: palette.textSecondary,
            marginBottom: 10,
        },
        suggestRow: {
            gap: 10,
            paddingRight: 8,
        },
        suggestChip: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            maxWidth: 280,
            padding: 12,
            borderRadius: 16,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        suggestTitle: {
            fontSize: 14,
            fontWeight: "800",
            color: palette.textPrimary,
        },
        suggestBody: {
            marginTop: 2,
            fontSize: 12,
            color: palette.textMuted,
            lineHeight: 16,
        },
        card: {
            borderRadius: 18,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            marginBottom: 12,
            overflow: "hidden",
        },
        cardTop: {
            padding: 14,
        },
        cardTitleRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
        },
        cardTitle: {
            flex: 1,
            fontSize: 17,
            fontWeight: "800",
            color: palette.textPrimary,
        },
        cardMeta: {
            marginTop: 6,
            fontSize: 12,
            fontWeight: "700",
            color: palette.oceanBlue,
        },
        cardTime: {
            marginTop: 4,
            fontSize: 13,
            color: palette.textSecondary,
        },
        cardDesc: {
            marginTop: 6,
            fontSize: 13,
            color: palette.textSecondary,
            lineHeight: 18,
        },
        cardDeep: {
            marginTop: 8,
            fontSize: 11,
            color: palette.textMuted,
        },
        cardActions: {
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: palette.borderSoft,
        },
        cardBtn: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 12,
        },
        cardBtnText: {
            fontSize: 13,
            fontWeight: "700",
            color: palette.oceanBlue,
        },
        empty: {
            textAlign: "center",
            marginTop: 40,
            color: palette.textMuted,
            fontSize: 14,
        },
    });
}
