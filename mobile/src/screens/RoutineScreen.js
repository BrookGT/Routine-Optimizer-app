import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import TopGreetingBanner from "../components/TopGreetingBanner";
import PlaceCard from "../components/PlaceCard";
import { Ionicons } from "@expo/vector-icons";
import { createRoutine, deleteRoutine, getRoutines } from "../api/routineApi";
import { getProfile } from "../api/profileApi";
import {
    getRecommendations,
    parseRecommendationsResponse,
} from "../api/recommendationApi";
import {
    createInteraction,
    createInteractionsBatch,
} from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { normalisePlace } from "../utils/recommendationPlaces";
import { getTodaysScheduleRows } from "../utils/todaysSchedule";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

const WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

const TIME_OF_DAY = ["morning", "afternoon", "evening"];

const ACTIVITY_TYPES = [
    "gym",
    "coffee",
    "reading",
    "hiking",
    "shopping",
    "restaurant",
    "study",
    "work",
    "walk",
    "yoga",
    "cinema",
    "social",
];

const LOCATION_PREF = ["indoor", "outdoor", "any"];

const BUDGET_RANGES = ["low", "medium", "high"];

const DEFAULT_ROUTINE_DRAFT = {
    weekday: "monday",
    timeOfDay: "morning",
    activityType: "gym",
    locationPreference: "any",
    budgetRange: "medium",
};

const TABS = [
    { key: "schedule", label: "Schedule" },
    { key: "recommendations", label: "Recommended" },
    { key: "planner", label: "Planner" },
];

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

function FieldRow({ label, valueLabel, onPress, styles, chevronColor }) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.fieldRow,
                pressed && styles.fieldRowPressed,
            ]}
        >
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.fieldRowRight}>
                <Text style={styles.fieldValue}>{valueLabel}</Text>
                <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={chevronColor}
                />
            </View>
        </Pressable>
    );
}

/** MainTabs floating bar: `hostWrap` uses bottom 12 + height 94 */
const TAB_BAR_FLOAT_HEIGHT = 12 + 94;
const FAB_CLEAR_GAP = 12;

export default function RoutineScreen() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    /** Sit above the custom tab bar (coordinates are inside SafeAreaView). */
    const fabBottom = useMemo(
        () =>
            Math.max(14, TAB_BAR_FLOAT_HEIGHT + FAB_CLEAR_GAP - insets.bottom),
        [insets.bottom],
    );

    const scrollBottomInset = useMemo(() => fabBottom + 56, [fabBottom]);

    const [tab, setTab] = useState("schedule");

    const [routines, setRoutines] = useState([]);
    const [profile, setProfile] = useState(null);
    const [recPlaces, setRecPlaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [now, setNow] = useState(() => new Date());
    const [modalVisible, setModalVisible] = useState(false);
    const [draft, setDraft] = useState(DEFAULT_ROUTINE_DRAFT);
    const [picker, setPicker] = useState(null);

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const [routineEnv, profileEnv, recEnv] = await Promise.all([
                getRoutines(),
                getProfile(),
                getRecommendations(),
            ]);

            const items = unwrapApiData(routineEnv, []);
            setRoutines(Array.isArray(items) ? items : []);
            setProfile(unwrapApiData(profileEnv, {}));

            const { recommendations } = parseRecommendationsResponse(recEnv);
            const mapped = Array.isArray(recommendations)
                ? recommendations.map((p, i) => normalisePlace(p, i))
                : [];
            setRecPlaces(mapped);

            if (mapped.length > 0) {
                const batch = mapped.slice(0, 8).map((place) => ({
                    placeId: place.placeId,
                    actionType: INTERACTION_TYPES.VIEW,
                    metadata: {
                        source: "routines_recommendations_tab",
                        place,
                    },
                }));
                createInteractionsBatch(batch).catch(() => null);
            }
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load routines."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    async function handleRefresh() {
        try {
            setRefreshing(true);
            await fetchAll();
        } finally {
            setRefreshing(false);
        }
    }

    const scheduleRows = useMemo(
        () => getTodaysScheduleRows(routines, profile, now),
        [routines, profile, now],
    );

    const bannerMeta = useMemo(() => {
        if (tab === "schedule") {
            return {
                eyebrow: "Today",
                title: "Your schedule",
                subtitle:
                    "Tap a block for places, meals, and filters for that activity.",
            };
        }
        if (tab === "recommendations") {
            return {
                eyebrow: "For you",
                title: "Spot recommendations",
                subtitle:
                    "Places aligned with your profile — open a card for details.",
            };
        }
        return {
            eyebrow: "Weekly planner",
            title: "My routines",
            subtitle:
                "Stay consistent — tap a routine for ideas, or add with + .",
        };
    }, [tab]);

    function navigateToActivityPicks(payload) {
        const parent =
            typeof navigation.getParent === "function"
                ? navigation.getParent()
                : null;
        if (parent?.navigate) {
            parent.navigate("ActivityRecommendations", payload);
            return;
        }
        navigation.navigate("ActivityRecommendations", payload);
    }

    function openAddRoutineModal() {
        setDraft({ ...DEFAULT_ROUTINE_DRAFT });
        setPicker(null);
        setModalVisible(true);
    }

    function closeAddRoutineModal() {
        setModalVisible(false);
        setPicker(null);
    }

    function renderPickerOptions() {
        const map = {
            weekday: WEEKDAYS,
            timeOfDay: TIME_OF_DAY,
            activityType: ACTIVITY_TYPES,
            locationPreference: LOCATION_PREF,
            budgetRange: BUDGET_RANGES,
        };
        const list = map[picker] ?? [];
        const titles = {
            weekday: "Day of week",
            timeOfDay: "Time of day",
            activityType: "Activity",
            locationPreference: "Place vibe",
            budgetRange: "Budget for this slot",
        };

        return (
            <View style={styles.pickerSheet}>
                <View style={styles.pickerHeader}>
                    <Pressable
                        onPress={() => setPicker(null)}
                        style={styles.pickerBack}
                    >
                        <Ionicons
                            name="arrow-back"
                            size={22}
                            color={palette.deepBlue}
                        />
                        <Text style={styles.pickerBackText}>Back</Text>
                    </Pressable>
                    <Text style={styles.pickerTitle}>{titles[picker]}</Text>
                </View>
                <ScrollView
                    style={styles.pickerScroll}
                    contentContainerStyle={styles.pickerScrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {list.map((opt) => (
                        <Pressable
                            key={opt}
                            onPress={() => {
                                setDraft((d) => ({ ...d, [picker]: opt }));
                                setPicker(null);
                            }}
                            style={({ pressed }) => [
                                styles.pickerOption,
                                draft[picker] === opt &&
                                    styles.pickerOptionSelected,
                                pressed && styles.pickerOptionPressed,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.pickerOptionText,
                                    draft[picker] === opt &&
                                        styles.pickerOptionTextSelected,
                                ]}
                            >
                                {formatLabel(opt)}
                            </Text>
                            {draft[picker] === opt ? (
                                <Ionicons
                                    name="checkmark-circle"
                                    size={22}
                                    color={palette.emerald}
                                />
                            ) : null}
                        </Pressable>
                    ))}
                </ScrollView>
            </View>
        );
    }

    async function handleAddRoutine() {
        if (busy) {
            return;
        }

        try {
            setBusy(true);
            setError("");
            const envelope = await createRoutine(draft);
            const created = unwrapApiData(envelope, null);
            if (created) {
                setRoutines((current) => [created, ...current]);
            }
            closeAddRoutineModal();
        } catch (err) {
            Alert.alert("Unable to add routine", getApiErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function handleDeleteRoutine(id) {
        try {
            await deleteRoutine(id);
            setRoutines((current) =>
                current.filter((routine) => routine.id !== id),
            );
        } catch (err) {
            Alert.alert("Unable to delete", getApiErrorMessage(err));
        }
    }

    async function openPlaceDetail(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.CLICK,
                metadata: {
                    source: "routines_rec_tab",
                    place,
                },
            });
        } catch {
            /* ignore */
        }
        const parent =
            typeof navigation.getParent === "function"
                ? navigation.getParent()
                : null;
        if (parent?.navigate) {
            parent.navigate("PlaceDetail", { place });
            return;
        }
        navigation.navigate("PlaceDetail", { place });
    }

    const daysPlanned = `${Math.min(routines.length, 7)}/7`;
    const routineMatch = `${Math.min(96, 40 + routines.length * 12)}%`;

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <TopGreetingBanner
                    eyebrow={bannerMeta.eyebrow}
                    title={bannerMeta.title}
                    subtitle={bannerMeta.subtitle}
                    onAction={handleRefresh}
                />

                <View
                    style={[
                        styles.segmentTrack,
                        isDark && styles.segmentTrackDark,
                    ]}
                >
                    {TABS.map((t) => {
                        const active = tab === t.key;
                        return (
                            <Pressable
                                key={t.key}
                                onPress={() => setTab(t.key)}
                                style={({ pressed }) => [
                                    styles.segmentCell,
                                    active && styles.segmentCellActive,
                                    pressed &&
                                        !active &&
                                        styles.segmentCellPressed,
                                ]}
                            >
                                <Text
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.85}
                                    style={[
                                        styles.segmentLabel,
                                        active && styles.segmentLabelActive,
                                    ]}
                                >
                                    {t.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {tab === "planner" ? (
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statMain}>{daysPlanned}</Text>
                            <Text style={styles.statLabel}>days planned</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statMain}>{routineMatch}</Text>
                            <Text style={styles.statLabel}>routine match</Text>
                        </View>
                    </View>
                ) : null}

                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {tab === "schedule" ? (
                    <ScrollView
                        style={styles.tabBody}
                        contentContainerStyle={[
                            styles.scheduleScrollContent,
                            { paddingBottom: scrollBottomInset },
                        ]}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={handleRefresh}
                            />
                        }
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.scheduleCard}>
                            <View style={styles.scheduleHeader}>
                                <View style={styles.scheduleTitleRow}>
                                    <Ionicons
                                        name="calendar-outline"
                                        size={18}
                                        color={palette.emerald}
                                    />
                                    <Text style={styles.scheduleTitle}>
                                        Today's schedule
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.scheduleList}>
                                {scheduleRows.map((row) => (
                                    <Pressable
                                        key={row.id}
                                        onPress={() =>
                                            navigateToActivityPicks({
                                                title: row.title,
                                                activityType: row.activityType,
                                                timeOfDay: row.timeOfDay,
                                                locationPreference:
                                                    row.locationPreference,
                                                budgetRange: row.budgetRange,
                                            })
                                        }
                                        style={({ pressed }) => [
                                            styles.scheduleRow,
                                            pressed &&
                                                styles.scheduleRowPressed,
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.scheduleIconWrap,
                                                {
                                                    backgroundColor: row.color,
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name={row.icon}
                                                size={20}
                                                color={palette.iceWhite}
                                            />
                                        </View>
                                        <View style={styles.scheduleRowText}>
                                            <Text
                                                style={styles.scheduleRowTitle}
                                            >
                                                {row.title}
                                            </Text>
                                            <View
                                                style={styles.scheduleTimeRow}
                                            >
                                                <Ionicons
                                                    name="time-outline"
                                                    size={14}
                                                    color={palette.textMuted}
                                                />
                                                <Text
                                                    style={styles.scheduleTime}
                                                >
                                                    {row.timeLabel}
                                                </Text>
                                            </View>
                                            <Text style={styles.scheduleHint}>
                                                Tap for places & meal ideas
                                            </Text>
                                        </View>
                                        <Ionicons
                                            name="chevron-forward"
                                            size={18}
                                            color={palette.textMuted}
                                        />
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </ScrollView>
                ) : null}

                {tab === "recommendations" ? (
                    <FlatList
                        style={styles.tabBody}
                        data={recPlaces}
                        keyExtractor={(item) => item.id}
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        contentContainerStyle={[
                            styles.listContent,
                            { paddingBottom: scrollBottomInset },
                        ]}
                        ListEmptyComponent={
                            !loading ? (
                                <EmptyState message="No recommendations yet." />
                            ) : null
                        }
                        renderItem={({ item }) => (
                            <PlaceCard
                                place={item}
                                onPress={() => openPlaceDetail(item)}
                            />
                        )}
                    />
                ) : null}

                {tab === "planner" ? (
                    routines.length === 0 && !loading ? (
                        <EmptyState message="No routines yet. Add your first one." />
                    ) : (
                        <FlatList
                            style={styles.tabBody}
                            data={routines}
                            keyExtractor={(item) => item.id}
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            contentContainerStyle={[
                                styles.listContent,
                                { paddingBottom: scrollBottomInset },
                            ]}
                            renderItem={({ item }) => (
                                <View style={styles.card}>
                                    <Pressable
                                        onPress={() =>
                                            navigateToActivityPicks({
                                                title: `${formatLabel(item.weekday)} · ${formatLabel(item.activityType)}`,
                                                activityType: item.activityType,
                                                timeOfDay: item.timeOfDay,
                                                locationPreference:
                                                    item.locationPreference,
                                                budgetRange: item.budgetRange,
                                            })
                                        }
                                        style={({ pressed }) => [
                                            styles.cardMain,
                                            pressed && styles.cardPressed,
                                        ]}
                                    >
                                        <Text style={styles.weekday}>
                                            {formatLabel(item.weekday)}
                                        </Text>
                                        <Text style={styles.period}>
                                            {formatLabel(item.timeOfDay)}
                                        </Text>
                                        <Text style={styles.activity}>
                                            {formatLabel(item.activityType)}
                                        </Text>

                                        <View style={styles.badgesRow}>
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>
                                                    {formatLabel(
                                                        item.locationPreference,
                                                    )}
                                                </Text>
                                            </View>
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>
                                                    {formatLabel(
                                                        item.budgetRange,
                                                    )}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.cardHint}>
                                            Tap for places & filters
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        style={styles.deletePill}
                                        onPress={() =>
                                            handleDeleteRoutine(item.id)
                                        }
                                    >
                                        <Ionicons
                                            name="trash-outline"
                                            size={14}
                                            color={palette.deepBlue}
                                        />
                                    </Pressable>
                                </View>
                            )}
                        />
                    )
                ) : null}

                {tab === "planner" ? (
                    <Pressable
                        style={[styles.fab, { bottom: fabBottom }]}
                        onPress={openAddRoutineModal}
                    >
                        <LinearGradient
                            colors={gradients.primaryButtonMint}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.fabFill}
                        >
                            <Ionicons
                                name="add"
                                size={24}
                                color={palette.iceWhite}
                            />
                        </LinearGradient>
                    </Pressable>
                ) : null}

                <Modal
                    visible={modalVisible}
                    animationType="slide"
                    transparent
                    onRequestClose={closeAddRoutineModal}
                >
                    <View style={styles.modalOverlay}>
                        <SafeAreaView style={styles.modalSafe}>
                            <View style={styles.modalCard}>
                                {!picker ? (
                                    <>
                                        <View style={styles.modalTopBar}>
                                            <Text style={styles.modalTitle}>
                                                New routine
                                            </Text>
                                            <Pressable
                                                onPress={closeAddRoutineModal}
                                                hitSlop={12}
                                            >
                                                <Ionicons
                                                    name="close"
                                                    size={26}
                                                    color={
                                                        palette.textSecondary
                                                    }
                                                />
                                            </Pressable>
                                        </View>
                                        <Text style={styles.modalHint}>
                                            Choose each field to create a
                                            routine that matches your real
                                            schedule.
                                        </Text>

                                        <FieldRow
                                            label="Day"
                                            valueLabel={formatLabel(
                                                draft.weekday,
                                            )}
                                            onPress={() => setPicker("weekday")}
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Time"
                                            valueLabel={formatLabel(
                                                draft.timeOfDay,
                                            )}
                                            onPress={() =>
                                                setPicker("timeOfDay")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Activity"
                                            valueLabel={formatLabel(
                                                draft.activityType,
                                            )}
                                            onPress={() =>
                                                setPicker("activityType")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Place vibe"
                                            valueLabel={formatLabel(
                                                draft.locationPreference,
                                            )}
                                            onPress={() =>
                                                setPicker("locationPreference")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Budget"
                                            valueLabel={formatLabel(
                                                draft.budgetRange,
                                            )}
                                            onPress={() =>
                                                setPicker("budgetRange")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />

                                        <Pressable
                                            style={styles.modalCtaWrap}
                                            onPress={handleAddRoutine}
                                            disabled={busy}
                                        >
                                            <LinearGradient
                                                colors={
                                                    gradients.primaryButtonMint
                                                }
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={styles.modalCta}
                                            >
                                                <Text
                                                    style={styles.modalCtaText}
                                                >
                                                    {busy
                                                        ? "Adding..."
                                                        : "Add routine"}
                                                </Text>
                                                <Ionicons
                                                    name="add"
                                                    size={17}
                                                    color={palette.iceWhite}
                                                />
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

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: palette.pageTop },
        screen: { flex: 1, paddingHorizontal: 16 },
        segmentTrack: {
            flexDirection: "row",
            alignItems: "stretch",
            marginTop: 10,
            marginBottom: 8,
            padding: 3,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: "rgba(255, 255, 255, 0.45)",
        },
        segmentTrackDark: {
            backgroundColor: "rgba(18, 35, 58, 0.55)",
            borderColor: "rgba(120, 199, 255, 0.2)",
        },
        segmentCell: {
            flex: 1,
            minHeight: 32,
            maxHeight: 36,
            paddingVertical: 6,
            paddingHorizontal: 6,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
        },
        segmentCellActive: {
            backgroundColor: palette.surfaceStrong,
            shadowColor: "#0A3A5C",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08,
            shadowRadius: 3,
            elevation: 2,
        },
        segmentCellPressed: {
            opacity: 0.92,
        },
        segmentLabel: {
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 0.15,
            color: palette.textMuted,
            textAlign: "center",
        },
        segmentLabelActive: {
            color: palette.textPrimary,
            fontWeight: "700",
        },
        tabBody: {
            flex: 1,
        },
        statsRow: {
            marginTop: 4,
            flexDirection: "row",
            gap: 10,
        },
        statCard: {
            flex: 1,
            borderRadius: 18,
            padding: 14,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.borderStrong,
        },
        statMain: {
            color: palette.oceanBlue,
            fontSize: 28,
            fontWeight: "800",
        },
        statLabel: {
            color: palette.textSecondary,
            fontSize: 12,
            marginTop: 2,
        },
        errorText: {
            color: palette.danger,
            marginTop: 8,
            fontSize: 12,
        },
        scheduleScrollContent: {
            paddingBottom: 24,
        },
        scheduleCard: {
            marginTop: 8,
            borderRadius: 20,
            backgroundColor: palette.surfaceStrong,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            shadowColor: "#0A3A5C",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 4,
        },
        scheduleHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
        },
        scheduleTitleRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        scheduleTitle: {
            color: palette.textPrimary,
            fontSize: 17,
            fontWeight: "800",
        },
        scheduleList: {
            gap: 12,
        },
        scheduleRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        scheduleRowPressed: {
            opacity: 0.88,
        },
        scheduleIconWrap: {
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
        },
        scheduleRowText: {
            flex: 1,
        },
        scheduleRowTitle: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "800",
        },
        scheduleTimeRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
        },
        scheduleTime: {
            color: palette.textMuted,
            fontSize: 13,
            fontWeight: "600",
        },
        scheduleHint: {
            marginTop: 4,
            color: palette.oceanBlue,
            fontSize: 11,
            fontWeight: "700",
        },
        listContent: {
            paddingTop: 16,
            paddingBottom: 24,
            gap: 12,
        },
        card: {
            borderRadius: 18,
            padding: 14,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
        },
        cardMain: {
            flex: 1,
        },
        cardPressed: {
            opacity: 0.92,
        },
        cardHint: {
            marginTop: 8,
            color: palette.oceanBlue,
            fontSize: 11,
            fontWeight: "700",
        },
        weekday: {
            color: palette.emerald,
            fontSize: 12,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.7,
        },
        period: {
            marginTop: 6,
            color: palette.textSecondary,
            fontSize: 12,
        },
        activity: {
            marginTop: 4,
            color: palette.textPrimary,
            fontSize: 22,
            fontWeight: "800",
        },
        badgesRow: {
            marginTop: 8,
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
        },
        badge: {
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surfaceStrong,
        },
        badgeText: {
            color: palette.textSecondary,
            fontSize: 11,
            fontWeight: "700",
        },
        deletePill: {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surfaceStrong,
            paddingHorizontal: 8,
            paddingVertical: 6,
        },
        fab: {
            position: "absolute",
            right: 20,
            width: 52,
            height: 52,
            borderRadius: 26,
            overflow: "hidden",
            backgroundColor: "transparent",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            shadowColor: "#269AE3",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 16,
        },
        fabFill: {
            width: "100%",
            height: "100%",
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#269AE3",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
        },
        modalOverlay: {
            flex: 1,
            backgroundColor: "rgba(5, 17, 30, 0.36)",
            justifyContent: "flex-end",
        },
        modalSafe: {
            width: "100%",
        },
        modalCard: {
            backgroundColor: palette.surfaceStrong,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 16,
            minHeight: 380,
        },
        modalTopBar: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        modalTitle: {
            color: palette.textPrimary,
            fontSize: 22,
            fontWeight: "900",
        },
        modalHint: {
            marginTop: 6,
            marginBottom: 10,
            color: palette.textSecondary,
            fontSize: 12,
            lineHeight: 18,
        },
        fieldRow: {
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surface,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8,
        },
        fieldRowPressed: {
            opacity: 0.9,
        },
        fieldLabel: {
            color: palette.textMuted,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            fontWeight: "700",
        },
        fieldRowRight: {
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
        },
        fieldValue: {
            color: palette.textPrimary,
            fontSize: 14,
            fontWeight: "700",
        },
        modalCtaWrap: {
            marginTop: 14,
            borderRadius: 14,
            overflow: "hidden",
        },
        modalCta: {
            height: 48,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
        },
        modalCtaText: {
            color: palette.iceWhite,
            fontWeight: "800",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            fontSize: 13,
        },
        pickerSheet: {
            flex: 1,
            minHeight: 320,
        },
        pickerHeader: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
        },
        pickerBack: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingVertical: 6,
            paddingHorizontal: 4,
        },
        pickerBackText: {
            color: palette.deepBlue,
            fontWeight: "700",
            fontSize: 13,
        },
        pickerTitle: {
            color: palette.textPrimary,
            fontSize: 17,
            fontWeight: "800",
        },
        pickerScroll: {
            flex: 1,
        },
        pickerScrollContent: {
            paddingBottom: 16,
            gap: 8,
        },
        pickerOption: {
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surface,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        pickerOptionSelected: {
            borderColor: palette.emerald,
            backgroundColor: "rgba(37, 201, 122, 0.12)",
        },
        pickerOptionPressed: {
            opacity: 0.9,
        },
        pickerOptionText: {
            color: palette.textPrimary,
            fontSize: 15,
            fontWeight: "700",
        },
        pickerOptionTextSelected: {
            color: palette.emerald,
        },
    });
}
