import { useEffect, useMemo, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Loader from "../components/Loader";
import { createRoutine, deleteRoutine, getRoutines } from "../api/routineApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const WEEKDAYS_MON_FRI = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKENDS_SAT_SUN  = ["saturday", "sunday"];

const TIME_OF_DAY = ["morning", "afternoon", "evening"];

const ACTIVITY_TYPES = [
    "gym", "coffee", "reading", "hiking", "shopping", "restaurant",
    "study", "work", "walk", "yoga", "cinema", "social", "prayer",
    "gaming", "networking", "meditation", "coding", "running", "music",
    "photography", "volunteering",
];

const LOCATION_PREF  = ["indoor", "outdoor", "any"];
const BUDGET_RANGES  = ["low", "medium", "high"];

const DEFAULT_WEEKDAY_DRAFT = {
    weekday:            "monday",
    timeOfDay:          "morning",
    activityType:       "gym",
    locationPreference: "any",
    budgetRange:        "medium",
};

const DEFAULT_WEEKEND_DRAFT = {
    weekday:            "saturday",
    timeOfDay:          "morning",
    activityType:       "coffee",
    locationPreference: "any",
    budgetRange:        "medium",
};

function formatLabel(value) {
    if (!value || typeof value !== "string") return "";
    return value
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

// ─── Profile summary helpers ───────────────────────────────────────────────────

function buildWeekdaySummary(profile) {
    const lines = [];

    if (profile?.wakeTime) {
        lines.push({ icon: "alarm-outline", text: `Wake up at ${profile.wakeTime}` });
    }

    const wh = profile?.workingHours;
    if (wh?.flexible) {
        lines.push({ icon: "shuffle-outline", text: "Flexible work schedule" });
    } else if (wh?.morning?.start && wh?.morning?.end) {
        const aft = wh.afternoon?.start && wh.afternoon?.end
            ? ` · ${wh.afternoon.start}–${wh.afternoon.end}`
            : "";
        lines.push({
            icon:  "briefcase-outline",
            text:  `Work: ${wh.morning.start}–${wh.morning.end}${aft}`,
        });
    }

    if (profile?.sleepTime) {
        lines.push({ icon: "moon-outline", text: `Bed at ${profile.sleepTime}` });
    }

    const acts = (profile?.weeklyActivities ?? [])
        .filter((a) => ["work", "study", "gym", "commute", "meetings", "networking", "coding"].includes(a))
        .slice(0, 4);
    if (acts.length > 0) {
        lines.push({
            icon: "calendar-outline",
            text: `Regulars: ${acts.map(formatLabel).join(", ")}`,
        });
    }

    return lines;
}

function buildWeekendSummary(profile) {
    const lines = [];

    const pref = profile?.weekendPreference;
    if (pref) {
        lines.push({ icon: "compass-outline", text: `Style: ${formatLabel(pref)}` });
    }

    const ei = (profile?.eventInterests ?? []).slice(0, 3);
    if (ei.length > 0) {
        lines.push({
            icon: "ticket-outline",
            text: `Event interests: ${ei.map(formatLabel).join(", ")}`,
        });
    }

    const religion = profile?.religion;
    if (religion && religion !== "prefer_not_to_say" && religion !== "other") {
        lines.push({
            icon: "heart-outline",
            text: `Faith-aligned events included`,
        });
    }

    const weekendActs = (profile?.weeklyActivities ?? [])
        .filter((a) => ["social", "gaming", "shopping", "movies", "reading", "music", "photography", "hiking", "volunteering"].includes(a))
        .slice(0, 4);
    if (weekendActs.length > 0) {
        lines.push({
            icon: "happy-outline",
            text: `Activities: ${weekendActs.map(formatLabel).join(", ")}`,
        });
    }

    return lines;
}

// ─── Components ────────────────────────────────────────────────────────────────

function SummaryCard({ lines, emptyText, styles, palette }) {
    if (!lines || lines.length === 0) {
        return (
            <View style={styles.summaryCard}>
                <Text style={styles.summaryEmptyText}>{emptyText}</Text>
            </View>
        );
    }
    return (
        <View style={styles.summaryCard}>
            {lines.map((l, i) => (
                <View key={i} style={styles.summaryLine}>
                    <Ionicons name={l.icon} size={14} color={palette.oceanBlue} />
                    <Text style={styles.summaryLineText}>{l.text}</Text>
                </View>
            ))}
        </View>
    );
}

function RoutineCard({ routine, onDelete, styles, palette }) {
    return (
        <View style={styles.card}>
            <View style={styles.cardLeft}>
                <Text style={styles.cardDay}>
                    {formatLabel(routine.weekday)} · {formatLabel(routine.timeOfDay)}
                </Text>
                <Text style={styles.cardActivity}>{formatLabel(routine.activityType)}</Text>
                <Text style={styles.cardMeta}>
                    {formatLabel(routine.locationPreference)} · {formatLabel(routine.budgetRange)} budget
                </Text>
            </View>
            <Pressable onPress={onDelete} hitSlop={10} style={styles.cardDeleteBtn}>
                <Ionicons name="trash-outline" size={16} color={palette.danger} />
            </Pressable>
        </View>
    );
}

function FieldRow({ label, valueLabel, onPress, styles, palette }) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed]}
        >
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.fieldRowRight}>
                <Text style={styles.fieldValue}>{valueLabel}</Text>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </View>
        </Pressable>
    );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function RoutineBuilderScreen({ navigation }) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
    const { profile } = useAuth();

    const [routines, setRoutines] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);
    const [error,    setError]    = useState("");

    const [routinePhase, setRoutinePhase]   = useState(0);

    const [modalVisible, setModalVisible]   = useState(false);
    const [modalSection, setModalSection]   = useState("weekday");
    const [draft,        setDraft]          = useState(DEFAULT_WEEKDAY_DRAFT);
    const [picker,       setPicker]         = useState(null);

    useEffect(() => {
        let mounted = true;

        async function loadRoutines() {
            try {
                setLoading(true);
                setError("");
                const envelope = await getRoutines();
                const items    = unwrapApiData(envelope, []);
                if (mounted) setRoutines(Array.isArray(items) ? items : []);
            } catch (err) {
                if (mounted) setError(getApiErrorMessage(err, "Unable to load routines."));
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadRoutines();
        return () => { mounted = false; };
    }, []);

    const weekdayRoutines = useMemo(
        () => routines.filter((r) => WEEKDAYS_MON_FRI.includes(r.weekday)),
        [routines],
    );
    const weekendRoutines = useMemo(
        () => routines.filter((r) => WEEKENDS_SAT_SUN.includes(r.weekday)),
        [routines],
    );

    const weekdaySummary = useMemo(() => buildWeekdaySummary(profile), [profile]);
    const weekendSummary = useMemo(() => buildWeekendSummary(profile), [profile]);

    function openModal(section) {
        setModalSection(section);
        setDraft(section === "weekday" ? { ...DEFAULT_WEEKDAY_DRAFT } : { ...DEFAULT_WEEKEND_DRAFT });
        setPicker(null);
        setModalVisible(true);
    }

    function closeModal() {
        setModalVisible(false);
        setPicker(null);
    }

    async function submitRoutine() {
        if (saving) return;
        try {
            setSaving(true);
            setError("");
            const envelope = await createRoutine(draft);
            const created  = unwrapApiData(envelope, null);
            if (created) setRoutines((cur) => [created, ...cur]);
            closeModal();
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to create routine."));
        } finally {
            setSaving(false);
        }
    }

    async function removeRoutine(id) {
        try {
            setError("");
            await deleteRoutine(id);
            setRoutines((cur) => cur.filter((item) => item.id !== id));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to delete routine."));
        }
    }

    // The day options depend on which section we're editing
    const availableDays = modalSection === "weekday" ? WEEKDAYS_MON_FRI : WEEKENDS_SAT_SUN;

    function renderPickerOptions() {
        const map = {
            weekday:            availableDays,
            timeOfDay:          TIME_OF_DAY,
            activityType:       ACTIVITY_TYPES,
            locationPreference: LOCATION_PREF,
            budgetRange:        BUDGET_RANGES,
        };
        const list = map[picker] ?? [];
        const titles = {
            weekday:            "Day",
            timeOfDay:          "Time of day",
            activityType:       "Activity",
            locationPreference: "Place vibe",
            budgetRange:        "Budget for this slot",
        };

        return (
            <View style={styles.pickerSheet}>
                <View style={styles.pickerHeader}>
                    <Pressable onPress={() => setPicker(null)} style={styles.pickerBack}>
                        <Ionicons name="arrow-back" size={22} color={palette.deepBlue} />
                        <Text style={styles.pickerBackText}>Back</Text>
                    </Pressable>
                    <Text style={styles.pickerTitle}>{titles[picker]}</Text>
                </View>
                <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerScrollContent}>
                    {list.map((opt) => (
                        <Pressable
                            key={opt}
                            onPress={() => { setDraft((d) => ({ ...d, [picker]: opt })); setPicker(null); }}
                            style={({ pressed }) => [
                                styles.pickerOption,
                                draft[picker] === opt && styles.pickerOptionSelected,
                                pressed && styles.pickerOptionPressed,
                            ]}
                        >
                            <Text style={[styles.pickerOptionText, draft[picker] === opt && styles.pickerOptionTextSelected]}>
                                {formatLabel(opt)}
                            </Text>
                            {draft[picker] === opt ? (
                                <Ionicons name="checkmark-circle" size={22} color={palette.emerald} />
                            ) : null}
                        </Pressable>
                    ))}
                </ScrollView>
            </View>
        );
    }

    const progressPhasePct = routinePhase === 0 ? "50%" : "100%";

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={gradients.appBackground} style={styles.screen}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.stepLabel}>
                            {routinePhase === 0 ? "Step 1 of 2 — Weekdays" : "Step 2 of 2 — Weekend"}
                        </Text>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFillPhase, { width: progressPhasePct }]} />
                        </View>
                    </View>
                    <Text style={styles.stepPct}>{routinePhase === 0 ? "50%" : "100%"}</Text>
                </View>

                {routinePhase === 0 ? (
                    <>
                        <Text style={styles.title}>Your weekday routine</Text>
                        <Text style={styles.subtitle}>
                            Monday to Friday: add the activities you usually do and when. This
                            helps the AI avoid busy work hours and suggest breaks, food, and
                            workouts at realistic times.
                        </Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.title}>Your weekend routine</Text>
                        <Text style={styles.subtitle}>
                            Saturday and Sunday: add how you like to rest, socialize, worship,
                            or explore. Weekends use a separate plan so suggestions match
                            your free time — not your work-week schedule.
                        </Text>
                    </>
                )}

                {error  ? <Text style={styles.errorText}>{error}</Text> : null}
                {loading ? <Loader /> : null}

                <ScrollView
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                >
                    {routinePhase === 0 ? (
                        <View style={styles.sectionBlock}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionTitleRow}>
                                    <Ionicons name="briefcase-outline" size={16} color={palette.oceanBlue} />
                                    <Text style={styles.sectionTitle}>Monday – Friday</Text>
                                    <View style={styles.daysBadge}>
                                        <Text style={styles.daysBadgeText}>Weekdays only</Text>
                                    </View>
                                </View>
                                <Text style={styles.sectionHint}>
                                    Example: gym in the morning, coffee after work, study block in
                                    the evening.
                                </Text>
                            </View>

                            <SummaryCard
                                lines={weekdaySummary}
                                emptyText="When you finish the earlier onboarding steps, a short summary of your weekday life appears here."
                                styles={styles}
                                palette={palette}
                            />

                            {weekdayRoutines.length > 0 ? (
                                <View style={styles.routinesList}>
                                    {weekdayRoutines.map((r) => (
                                        <RoutineCard
                                            key={r.id}
                                            routine={r}
                                            onDelete={() => removeRoutine(r.id)}
                                            styles={styles}
                                            palette={palette}
                                        />
                                    ))}
                                </View>
                            ) : (
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyStateText}>
                                        No activities yet — tap the button below to add one.
                                    </Text>
                                </View>
                            )}

                            <Pressable onPress={() => openModal("weekday")} style={styles.addBtn}>
                                <Ionicons name="add-circle-outline" size={18} color={palette.deepBlue} />
                                <Text style={styles.addBtnText}>Add a weekday activity</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.sectionBlock}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionTitleRow}>
                                    <Ionicons name="sunny-outline" size={16} color={palette.emerald} />
                                    <Text style={[styles.sectionTitle, { color: palette.emerald }]}>
                                        Saturday & Sunday
                                    </Text>
                                    <View style={[styles.daysBadge, styles.daysBadgeWeekend]}>
                                        <Text style={[styles.daysBadgeText, { color: palette.emerald }]}>
                                            Weekend only
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.sectionHint}>
                                    Weekends are for recovery and what you enjoy — church,
                                    family, hiking, cinema, or staying in. Add blocks here so
                                    recommendations fit those days, not your office hours.
                                </Text>
                            </View>

                            <SummaryCard
                                lines={weekendSummary}
                                emptyText="Your weekend style and interests from onboarding will show here once set."
                                styles={styles}
                                palette={palette}
                            />

                            {weekendRoutines.length > 0 ? (
                                <View style={styles.routinesList}>
                                    {weekendRoutines.map((r) => (
                                        <RoutineCard
                                            key={r.id}
                                            routine={r}
                                            onDelete={() => removeRoutine(r.id)}
                                            styles={styles}
                                            palette={palette}
                                        />
                                    ))}
                                </View>
                            ) : (
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyStateText}>
                                        No weekend plans yet — add at least one if you can.
                                    </Text>
                                </View>
                            )}

                            <Pressable
                                onPress={() => openModal("weekend")}
                                style={[styles.addBtn, styles.addBtnWeekend]}
                            >
                                <Ionicons name="add-circle-outline" size={18} color={palette.emerald} />
                                <Text style={[styles.addBtnText, { color: palette.emerald }]}>
                                    Add a weekend activity
                                </Text>
                            </Pressable>
                        </View>
                    )}
                </ScrollView>

                {/* Footer: phase navigation */}
                <View style={styles.routineFooterRow}>
                    {routinePhase === 1 ? (
                        <Pressable
                            onPress={() => setRoutinePhase(0)}
                            style={styles.secondaryBtnWrap}
                        >
                            <Ionicons name="arrow-back" size={16} color={palette.textSecondary} style={{ marginRight: 4 }} />
                            <Text style={styles.secondaryBtnText}>Weekdays</Text>
                        </Pressable>
                    ) : (
                        <View style={styles.footerSpacer} />
                    )}
                    <Pressable
                        style={styles.ctaWrapFlex}
                        onPress={
                            routinePhase === 0
                                ? () => setRoutinePhase(1)
                                : () => navigation.replace("MainTabs")
                        }
                    >
                        <LinearGradient
                            colors={
                                routinePhase === 0
                                    ? gradients.primaryButton
                                    : gradients.primaryButtonMint
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cta}
                        >
                            <Text style={styles.ctaText}>
                                {routinePhase === 0
                                    ? "Continue to weekend"
                                    : "Save all & start exploring"}
                            </Text>
                            <Ionicons name="arrow-forward" size={16} color={palette.iceWhite} />
                        </LinearGradient>
                    </Pressable>
                </View>

                {/* ── Modal ────────────────────────────────────────────────── */}
                <Modal
                    visible={modalVisible}
                    animationType="slide"
                    transparent
                    onRequestClose={closeModal}
                >
                    <View style={styles.modalOverlay}>
                        <SafeAreaView style={styles.modalSafe}>
                            <View style={styles.modalCard}>
                                {!picker ? (
                                    <>
                                        <View style={styles.modalTopBar}>
                                            <View>
                                                <Text style={styles.modalTitle}>New activity</Text>
                                                <Text style={styles.modalSectionBadge}>
                                                    {modalSection === "weekday" ? "Mon – Fri" : "Sat – Sun"}
                                                </Text>
                                            </View>
                                            <Pressable onPress={closeModal} hitSlop={12}>
                                                <Ionicons name="close" size={26} color={palette.textSecondary} />
                                            </Pressable>
                                        </View>
                                        <Text style={styles.modalHint}>
                                            Tap each row to choose, then add to your routine.
                                        </Text>

                                        <FieldRow
                                            label="Day"
                                            valueLabel={formatLabel(draft.weekday)}
                                            onPress={() => setPicker("weekday")}
                                            styles={styles}
                                            palette={palette}
                                        />
                                        <FieldRow
                                            label="Time of day"
                                            valueLabel={formatLabel(draft.timeOfDay)}
                                            onPress={() => setPicker("timeOfDay")}
                                            styles={styles}
                                            palette={palette}
                                        />
                                        <FieldRow
                                            label="Activity"
                                            valueLabel={formatLabel(draft.activityType)}
                                            onPress={() => setPicker("activityType")}
                                            styles={styles}
                                            palette={palette}
                                        />
                                        <FieldRow
                                            label="Place vibe"
                                            valueLabel={formatLabel(draft.locationPreference)}
                                            onPress={() => setPicker("locationPreference")}
                                            styles={styles}
                                            palette={palette}
                                        />
                                        <FieldRow
                                            label="Budget"
                                            valueLabel={formatLabel(draft.budgetRange)}
                                            onPress={() => setPicker("budgetRange")}
                                            styles={styles}
                                            palette={palette}
                                        />

                                        <Pressable
                                            onPress={submitRoutine}
                                            disabled={saving}
                                            style={[styles.modalAddWrap, saving && styles.modalAddDisabled]}
                                        >
                                            <LinearGradient
                                                colors={gradients.primaryButton}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={styles.modalAddBtn}
                                            >
                                                <Text style={styles.modalAddText}>
                                                    {saving ? "Adding…" : "Add activity"}
                                                </Text>
                                            </LinearGradient>
                                        </Pressable>
                                    </>
                                ) : (
                                    renderPickerOptions()
                                )}
                            </View>
                        </SafeAreaView>
                    </View>
                </Modal>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: palette.pageTop,
        },
        screen: {
            flex: 1,
            paddingHorizontal: 20,
            paddingTop: 8,
        },

        // ── Header ─────────────────────────────────────────────────────────
        header: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        headerLeft: {
            flex: 1,
            marginRight: 12,
        },
        stepLabel: {
            color: palette.textMuted,
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontWeight: "800",
            marginBottom: 8,
        },
        progressTrack: {
            width: "100%",
            maxWidth: 280,
            height: 4,
            borderRadius: 999,
            backgroundColor: "rgba(10, 108, 168, 0.2)",
            overflow: "hidden",
        },
        progressFill: {
            width: "100%",
            height: "100%",
            backgroundColor: palette.oceanBlue,
        },
        progressFillPhase: {
            height: "100%",
            backgroundColor: palette.oceanBlue,
            borderRadius: 999,
        },
        stepPct: {
            color: palette.oceanBlue,
            fontSize: 15,
            fontWeight: "800",
        },
        title: {
            marginTop: 16,
            color: palette.textPrimary,
            fontSize: 30,
            lineHeight: 36,
            fontWeight: "800",
        },
        subtitle: {
            marginTop: 8,
            color: palette.textSecondary,
            fontSize: 14,
            lineHeight: 21,
        },
        errorText: {
            marginTop: 10,
            color: palette.danger,
            fontSize: 12,
        },

        // ── List ───────────────────────────────────────────────────────────
        list: {
            marginTop: 16,
        },
        listContent: {
            paddingBottom: 100,
            gap: 0,
        },

        // ── Section blocks ─────────────────────────────────────────────────
        sectionBlock: {
            paddingBottom: 8,
        },
        sectionHeader: {
            marginBottom: 12,
        },
        sectionTitleRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        sectionTitle: {
            color: palette.oceanBlue,
            fontSize: 16,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.8,
        },
        daysBadge: {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: isDark ? "rgba(31,100,200,0.15)" : "rgba(31,159,234,0.08)",
            paddingHorizontal: 8,
            paddingVertical: 2,
        },
        daysBadgeWeekend: {
            borderColor: "rgba(38,201,122,0.3)",
            backgroundColor: isDark ? "rgba(38,201,122,0.12)" : "rgba(38,201,122,0.07)",
        },
        daysBadgeText: {
            color: palette.oceanBlue,
            fontSize: 11,
            fontWeight: "700",
        },
        sectionHint: {
            marginTop: 4,
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 18,
        },

        // ── Summary card ───────────────────────────────────────────────────
        summaryCard: {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 14,
            marginBottom: 12,
            gap: 8,
        },
        summaryLine: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        summaryLineText: {
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 18,
            flex: 1,
        },
        summaryEmptyText: {
            color: palette.textMuted,
            fontSize: 13,
            fontStyle: "italic",
        },

        // ── Routines list ──────────────────────────────────────────────────
        routinesList: {
            gap: 8,
            marginBottom: 10,
        },
        card: {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        cardLeft: { flex: 1 },
        cardDay: {
            color: palette.textMuted,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: "700",
        },
        cardActivity: {
            marginTop: 4,
            color: palette.oceanBlue,
            fontSize: 16,
            fontWeight: "800",
        },
        cardMeta: {
            marginTop: 3,
            color: palette.textSecondary,
            fontSize: 12,
        },
        cardDeleteBtn: {
            padding: 8,
        },

        // ── Empty state ────────────────────────────────────────────────────
        emptyState: {
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            borderStyle: "dashed",
            paddingVertical: 18,
            alignItems: "center",
            marginBottom: 10,
        },
        emptyStateText: {
            color: palette.textMuted,
            fontSize: 13,
            fontStyle: "italic",
        },

        // ── Add button ─────────────────────────────────────────────────────
        addBtn: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            alignSelf: "flex-start",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: "rgba(31,159,234,0.08)",
            paddingHorizontal: 14,
            paddingVertical: 10,
            marginBottom: 4,
        },
        addBtnWeekend: {
            backgroundColor: "rgba(38,201,122,0.08)",
            borderColor: "rgba(38,201,122,0.3)",
        },
        addBtnText: {
            color: palette.deepBlue,
            fontWeight: "800",
            fontSize: 13,
        },

        // ── Divider ────────────────────────────────────────────────────────
        sectionDivider: {
            marginVertical: 20,
            height: 1,
            backgroundColor: palette.borderStrong,
        },

        // ── Footer (two-phase flow) ───────────────────────────────────────
        routineFooterRow: {
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 24,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        footerSpacer: {
            width: 100,
        },
        secondaryBtnWrap: {
            width: 100,
            height: 54,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
        },
        secondaryBtnText: {
            color: palette.textSecondary,
            fontWeight: "800",
            fontSize: 15,
        },
        ctaWrapFlex: {
            flex: 1,
            borderRadius: 16,
            overflow: "hidden",
        },
        // legacy single-CTA layout (unused; kept for reference)
        ctaWrap: {
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 24,
            borderRadius: 16,
            overflow: "hidden",
        },
        cta: {
            height: 54,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
        },
        ctaText: {
            color: palette.iceWhite,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.3,
        },

        // ── Modal ──────────────────────────────────────────────────────────
        modalOverlay: {
            flex: 1,
            backgroundColor: "rgba(6, 22, 40, 0.45)",
            justifyContent: "flex-end",
        },
        modalSafe: {
            maxHeight: "92%",
        },
        modalCard: {
            backgroundColor: palette.pageTop,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 18,
            paddingBottom: 24,
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        modalTopBar: {
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            paddingTop: 16,
            paddingBottom: 4,
        },
        modalTitle: {
            color: palette.textPrimary,
            fontSize: 20,
            fontWeight: "800",
        },
        modalSectionBadge: {
            marginTop: 2,
            color: palette.textMuted,
            fontSize: 12,
            fontWeight: "600",
        },
        modalHint: {
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 19,
            marginBottom: 12,
        },
        fieldRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
            paddingHorizontal: 4,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: palette.borderSoft,
        },
        fieldRowPressed: { opacity: 0.75 },
        fieldLabel: {
            color: palette.textMuted,
            fontSize: 12,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.6,
        },
        fieldRowRight: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
        },
        fieldValue: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "700",
        },
        modalAddWrap: {
            marginTop: 18,
            borderRadius: 16,
            overflow: "hidden",
        },
        modalAddDisabled: { opacity: 0.55 },
        modalAddBtn: {
            height: 52,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
        },
        modalAddText: {
            color: palette.iceWhite,
            fontWeight: "800",
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: 0.4,
        },
        pickerSheet: {
            paddingTop: 8,
            minHeight: 360,
        },
        pickerHeader: {
            marginBottom: 8,
        },
        pickerBack: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 8,
        },
        pickerBackText: {
            color: palette.deepBlue,
            fontSize: 16,
            fontWeight: "700",
        },
        pickerTitle: {
            marginTop: 6,
            color: palette.textPrimary,
            fontSize: 18,
            fontWeight: "800",
        },
        pickerScroll: {
            maxHeight: 420,
        },
        pickerScrollContent: {
            paddingBottom: 24,
            gap: 6,
        },
        pickerOption: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
        },
        pickerOptionSelected: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.12)",
        },
        pickerOptionPressed: { opacity: 0.85 },
        pickerOptionText: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "600",
        },
        pickerOptionTextSelected: {
            color: palette.deepBlue,
            fontWeight: "800",
        },
    });
}
