import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    FlatList,
    Image,
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
import { Ionicons } from "@expo/vector-icons";

import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import TopGreetingBanner from "../components/TopGreetingBanner";
import PlaceCard from "../components/PlaceCard";

import { createRoutine, deleteRoutine, getRoutines } from "../api/routineApi";
import { getProfile } from "../api/profileApi";
import {
    getRecommendations,
    parseRecommendationsResponse,
} from "../api/recommendationApi";
import { getAiSchedule } from "../api/scheduleApi";
import {
    createInteraction,
    createInteractionsBatch,
} from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { normalisePlace } from "../utils/recommendationPlaces";
import { getTodaysScheduleRows } from "../utils/todaysSchedule";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { getLocationQueryParams } from "../utils/locationForApi";
import { useAppTheme } from "../context/ThemeContext";

// ─── Image preloader ──────────────────────────────────────────────────────────

function preloadScheduleImages(schedule) {
    try {
        const urls = [];
        for (const slots of Object.values(schedule ?? {})) {
            for (const slot of (slots ?? [])) {
                const img = slot?.place?.images?.[0] ?? slot?.place?.image;
                if (typeof img === "string" && img.startsWith("http")) {
                    urls.push(img);
                }
            }
        }
        // Prefetch up to 6 images without blocking
        urls.slice(0, 6).forEach(url => Image.prefetch(url).catch(() => null));
    } catch {
        // non-fatal
    }
}

// ─── Static data ──────────────────────────────────────────────────────────────

const WEEKDAYS = [
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
];
const TIME_OF_DAY = ["morning", "afternoon", "evening"];
const ACTIVITY_TYPES = [
    "gym", "coffee", "reading", "hiking", "shopping",
    "restaurant", "study", "work", "walk", "yoga", "cinema", "social",
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
    { key: "schedule",        label: "Schedule"    },
    { key: "recommendations", label: "Recommended" },
    { key: "planner",         label: "Planner"     },
];

const PERIODS = [
    { key: "morning",   label: "Morning",   timeRange: "5 AM – 12 PM", icon: "sunny-outline",         gradient: ["#FEF3C7", "#FDE68A"] },
    { key: "afternoon", label: "Afternoon", timeRange: "12 PM – 5 PM", icon: "partly-sunny-outline",  gradient: ["#DBEAFE", "#BFDBFE"] },
    { key: "evening",   label: "Evening",   timeRange: "5 PM – 9 PM",  icon: "moon-outline",          gradient: ["#EDE9FE", "#DDD6FE"] },
    { key: "night",     label: "Night",     timeRange: "9 PM – 5 AM",  icon: "star-outline",          gradient: ["#F0FDF4", "#DCFCE7"] },
];

const PERIOD_HEADER_COLORS = {
    morning:   "#F59E0B",
    afternoon: "#3B82F6",
    evening:   "#8B5CF6",
    night:     "#10B981",
};

const BADGE_COLORS = {
    purple:  { bg: "rgba(139,92,246,0.14)", text: "#7C3AED", border: "rgba(139,92,246,0.3)" },
    blue:    { bg: "rgba(59,130,246,0.14)", text: "#2563EB", border: "rgba(59,130,246,0.3)" },
    green:   { bg: "rgba(16,185,129,0.14)", text: "#059669", border: "rgba(16,185,129,0.3)" },
    orange:  { bg: "rgba(245,158,11,0.14)", text: "#D97706", border: "rgba(245,158,11,0.3)" },
    teal:    { bg: "rgba(20,184,166,0.14)", text: "#0D9488", border: "rgba(20,184,166,0.3)" },
};

const PERSONALIZATION_CONFIG = {
    high:   { label: "Highly personalized for you",  icon: "sparkles",       color: "#8B5CF6" },
    medium: { label: "Personalized to your habits",  icon: "trending-up",    color: "#3B82F6" },
    low:    { label: "Based on your profile",         icon: "person-outline", color: "#10B981" },
};

/** MainTabs floating bar: hostWrap uses bottom 12 + height 94 */
const TAB_BAR_FLOAT_HEIGHT = 12 + 94;
const FAB_CLEAR_GAP        = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLabel(value) {
    if (!value || typeof value !== "string") return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCurrentPeriod() {
    const h = new Date().getHours();
    if (h >= 5  && h < 12) return "morning";
    if (h >= 12 && h < 17) return "afternoon";
    if (h >= 17 && h < 21) return "evening";
    return "night";
}

function priceLevelDots(level) {
    if (!level && level !== 0) return null;
    const filled = Math.min(4, Math.max(0, level));
    return "$".repeat(filled) + "·".repeat(4 - filled);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AIStatusBanner({ meta, palette, styles }) {
    if (!meta) return null;
    const cfg = PERSONALIZATION_CONFIG[meta.personalizationLevel] ?? PERSONALIZATION_CONFIG.low;
    return (
        <View style={[styles.aiBanner, { borderColor: `${cfg.color}40` }]}>
            <View style={[styles.aiBannerDot, { backgroundColor: cfg.color }]} />
            <Text style={[styles.aiBannerText, { color: cfg.color }]}>
                {cfg.label}
            </Text>
            {meta.basedOn?.length > 0 && (
                <Text style={styles.aiBannerSub}>
                    · {meta.basedOn.join(", ")}
                </Text>
            )}
        </View>
    );
}

function BadgeChip({ badge, isDark }) {
    const theme = BADGE_COLORS[badge.variant] ?? BADGE_COLORS.blue;
    return (
        <View style={[
            { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1,
              borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
        ]}>
            <Text style={{ color: theme.text, fontSize: 10, fontWeight: "700" }}>
                {badge.label}
            </Text>
        </View>
    );
}

function PeriodHeader({ period, isCurrent, styles, palette }) {
    const color = PERIOD_HEADER_COLORS[period.key] ?? "#6366F1";
    return (
        <View style={styles.periodHeader}>
            <View style={[styles.periodDot, { backgroundColor: color }]} />
            <Ionicons name={period.icon} size={15} color={color} />
            <Text style={[styles.periodLabel, { color }]}>{period.label}</Text>
            <Text style={styles.periodTimeRange}>{period.timeRange}</Text>
            {isCurrent && (
                <View style={[styles.nowBadge, { borderColor: `${color}50`, backgroundColor: `${color}18` }]}>
                    <Text style={[styles.nowBadgeText, { color }]}>NOW</Text>
                </View>
            )}
        </View>
    );
}

function ActivityCard({
    slot,
    onPress,
    onPlacePress,
    isDark,
    palette,
    styles,
}) {
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1, duration: 380, useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    const place = slot.place;
    const hasPricing = place?.pricingEnabled && (
        place.estimatedCost ?? place.priceLevel != null
    );

    return (
        <Animated.View style={{ opacity: fadeAnim }}>
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    styles.activityCard,
                    pressed && styles.activityCardPressed,
                ]}
            >
                {/* Icon block */}
                <View style={[styles.activityIconWrap, { backgroundColor: slot.color }]}>
                    <Ionicons name={slot.icon} size={22} color="#FFF" />
                    {slot.isMicro && (
                        <View style={styles.microDot}>
                            <Ionicons name="sparkles" size={9} color="#FFF" />
                        </View>
                    )}
                </View>

                {/* Main content */}
                <View style={styles.activityContent}>
                    {/* Title row */}
                    <View style={styles.activityTitleRow}>
                        <Text style={styles.activityTitle} numberOfLines={1}>
                            {slot.title}
                        </Text>
                        {slot.isMicro ? (
                            <View style={styles.aiPickPill}>
                                <Text style={styles.aiPickPillText}>AI Pick</Text>
                            </View>
                        ) : (
                            <Ionicons
                                name="chevron-forward"
                                size={16}
                                color={palette.textMuted}
                            />
                        )}
                    </View>

                    {/* Time + duration */}
                    <View style={styles.activityMetaRow}>
                        <Ionicons name="time-outline" size={12} color={palette.textMuted} />
                        <Text style={styles.activityTime}>{slot.time}</Text>
                        <Text style={styles.activityDot}>·</Text>
                        <Text style={styles.activityDuration}>{slot.duration}</Text>
                    </View>

                    {/* Place info (if available) */}
                    {place ? (
                        <Pressable
                            onPress={onPlacePress}
                            style={({ pressed }) => [
                                styles.placeChip,
                                pressed && { opacity: 0.8 },
                            ]}
                        >
                            <Ionicons
                                name="location-outline"
                                size={12}
                                color={palette.oceanBlue}
                            />
                            <Text style={styles.placeChipName} numberOfLines={1}>
                                {place.name}
                            </Text>
                            <Text style={styles.placeChipDistance}>
                                {place.distance}
                            </Text>
                            {hasPricing && (
                                <Text style={styles.placeChipPrice}>
                                    {place.estimatedCost
                                        ? `~${place.estimatedCost}`
                                        : priceLevelDots(place.priceLevel)}
                                </Text>
                            )}
                        </Pressable>
                    ) : (
                        <Text style={styles.activityHint}>
                            Tap for places &amp; ideas
                        </Text>
                    )}

                    {/* AI reason */}
                    {slot.reason ? (
                        <Text style={styles.activityReason} numberOfLines={2}>
                            {slot.reason}
                        </Text>
                    ) : null}

                    {/* Badges */}
                    {slot.badges?.length > 0 && (
                        <View style={styles.badgesRow}>
                            {slot.badges.map(b => (
                                <BadgeChip key={b.key} badge={b} isDark={isDark} />
                            ))}
                        </View>
                    )}
                </View>
            </Pressable>
        </Animated.View>
    );
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RoutineScreen() {
    const navigation = useNavigation();
    const insets     = useSafeAreaInsets();
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

    const fabBottom = useMemo(
        () => Math.max(14, TAB_BAR_FLOAT_HEIGHT + FAB_CLEAR_GAP - insets.bottom),
        [insets.bottom],
    );
    const scrollBottomInset = useMemo(() => fabBottom + 56, [fabBottom]);

    const [tab,         setTab]         = useState("schedule");
    const [routines,    setRoutines]    = useState([]);
    const [profile,     setProfile]     = useState(null);
    const [recPlaces,   setRecPlaces]   = useState([]);
    const [aiSchedule,  setAiSchedule]  = useState(null);   // { morning, afternoon, evening, night }
    const [aiMeta,      setAiMeta]      = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [aiLoading,   setAiLoading]   = useState(false);
    const [busy,        setBusy]        = useState(false);
    const [error,       setError]       = useState("");
    const [refreshing,  setRefreshing]  = useState(false);
    const [now,         setNow]         = useState(() => new Date());
    const [modalVisible,setModalVisible]= useState(false);
    const [draft,       setDraft]       = useState(DEFAULT_ROUTINE_DRAFT);
    const [picker,      setPicker]      = useState(null);

    // ── Data loading ─────────────────────────────────────────────────────────

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const loc = await getLocationQueryParams(5);

            const [routineEnv, profileEnv, recEnv] = await Promise.all([
                getRoutines(),
                getProfile(),
                getRecommendations(loc),
            ]);

            const items = unwrapApiData(routineEnv, []);
            setRoutines(Array.isArray(items) ? items : []);

            const p = unwrapApiData(profileEnv, {});
            setProfile(p);

            const { recommendations } = parseRecommendationsResponse(recEnv);
            const mapped = Array.isArray(recommendations)
                ? recommendations.map((r, i) => normalisePlace(r, i))
                : [];
            setRecPlaces(mapped);

            if (mapped.length > 0) {
                const batch = mapped.slice(0, 8).map((place) => ({
                    placeId:    place.placeId,
                    actionType: INTERACTION_TYPES.VIEW,
                    metadata:   { source: "routines_recommendations_tab", place },
                }));
                createInteractionsBatch(batch).catch(() => null);
            }

            // Fetch AI schedule (non-blocking — show local schedule while loading)
            setAiLoading(true);
            getAiSchedule(loc)
                .then((resp) => {
                    if (resp?.success && resp?.data) {
                        setAiSchedule(resp.data);
                        setAiMeta(resp.meta ?? null);
                        // Preload top place images for fast detail open
                        preloadScheduleImages(resp.data);
                    }
                })
                .catch(() => null)
                .finally(() => setAiLoading(false));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load schedule."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);

    // ── Local fallback schedule (used until AI schedule arrives) ─────────────

    const localScheduleRows = useMemo(
        () => getTodaysScheduleRows(routines, profile, now),
        [routines, profile, now],
    );

    // ── Convert local rows to the same grouped shape as AI schedule ──────────

    const localScheduleGrouped = useMemo(() => {
        const grouped = { morning: [], afternoon: [], evening: [], night: [] };
        for (const row of localScheduleRows) {
            const p = row.timeOfDay ?? "morning";
            const period = ["morning","afternoon","evening","night"].includes(p)
                ? p : "morning";
            grouped[period].push({
                id:                row.id,
                period,
                time:              row.timeLabel,
                title:             row.title,
                activityType:      row.activityType,
                icon:              row.icon,
                color:             row.color,
                duration:          "45 min",
                source:            row.routine ? "routine" : "onboarding",
                routineId:         row.routine?.id ?? null,
                reason:            null,
                badges:            [],
                place:             null,
                locationPreference: row.locationPreference,
                budgetRange:       row.budgetRange,
            });
        }
        return grouped;
    }, [localScheduleRows]);

    // Active schedule: prefer AI schedule, fall back to local
    const activeSchedule = aiSchedule ?? localScheduleGrouped;

    const currentPeriod = useMemo(() => getCurrentPeriod(), [now]);

    // ── Navigation helpers ───────────────────────────────────────────────────

    function navigateToActivityPicks(payload) {
        const parent = navigation.getParent?.();
        const target = parent?.navigate ?? navigation.navigate.bind(navigation);
        target("ActivityRecommendations", payload);
    }

    function openPlaceDetail(place) {
        createInteraction({
            placeId:    place.placeId,
            actionType: INTERACTION_TYPES.CLICK,
            metadata:   { source: "schedule_place_chip", place },
        }).catch(() => null);
        const parent = navigation.getParent?.();
        const target = parent?.navigate ?? navigation.navigate.bind(navigation);
        target("PlaceDetail", { place });
    }

    // ── Routine CRUD ─────────────────────────────────────────────────────────

    function openAddRoutineModal() {
        setDraft({ ...DEFAULT_ROUTINE_DRAFT });
        setPicker(null);
        setModalVisible(true);
    }
    function closeAddRoutineModal() {
        setModalVisible(false);
        setPicker(null);
    }

    async function handleAddRoutine() {
        if (busy) return;
        try {
            setBusy(true);
            setError("");
            const envelope = await createRoutine(draft);
            const created  = unwrapApiData(envelope, null);
            if (created) setRoutines(cur => [created, ...cur]);
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
            setRoutines(cur => cur.filter(r => r.id !== id));
        } catch (err) {
            Alert.alert("Unable to delete", getApiErrorMessage(err));
        }
    }

    async function handleRefresh() {
        try {
            setRefreshing(true);
            setAiSchedule(null);
            setAiMeta(null);
            await fetchAll();
        } finally {
            setRefreshing(false);
        }
    }

    // ── Picker sheet ─────────────────────────────────────────────────────────

    function renderPickerOptions() {
        const optionMap = {
            weekday:            WEEKDAYS,
            timeOfDay:          TIME_OF_DAY,
            activityType:       ACTIVITY_TYPES,
            locationPreference: LOCATION_PREF,
            budgetRange:        BUDGET_RANGES,
        };
        const titles = {
            weekday:            "Day of week",
            timeOfDay:          "Time of day",
            activityType:       "Activity",
            locationPreference: "Place vibe",
            budgetRange:        "Budget for this slot",
        };
        const list = optionMap[picker] ?? [];

        return (
            <View style={styles.pickerSheet}>
                <View style={styles.pickerHeader}>
                    <Pressable
                        onPress={() => setPicker(null)}
                        style={styles.pickerBack}
                    >
                        <Ionicons name="arrow-back" size={22} color={palette.deepBlue} />
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
                                setDraft(d => ({ ...d, [picker]: opt }));
                                setPicker(null);
                            }}
                            style={({ pressed }) => [
                                styles.pickerOption,
                                draft[picker] === opt && styles.pickerOptionSelected,
                                pressed && styles.pickerOptionPressed,
                            ]}
                        >
                            <Text style={[
                                styles.pickerOptionText,
                                draft[picker] === opt && styles.pickerOptionTextSelected,
                            ]}>
                                {formatLabel(opt)}
                            </Text>
                            {draft[picker] === opt && (
                                <Ionicons
                                    name="checkmark-circle"
                                    size={22}
                                    color={palette.emerald}
                                />
                            )}
                        </Pressable>
                    ))}
                </ScrollView>
            </View>
        );
    }

    // ── Planner stats ────────────────────────────────────────────────────────

    const daysPlanned  = `${Math.min(routines.length, 7)}/7`;
    const routineMatch = `${Math.min(96, 40 + routines.length * 12)}%`;

    // ── Banner meta ──────────────────────────────────────────────────────────

    const bannerMeta = useMemo(() => {
        if (tab === "schedule") {
            return {
                eyebrow:  "Today",
                title:    "Your AI planner",
                subtitle: "Your day, intelligently planned — tap any block to explore.",
            };
        }
        if (tab === "recommendations") {
            return {
                eyebrow:  "For you",
                title:    "Spot recommendations",
                subtitle: "Places aligned with your profile — tap a card for details.",
            };
        }
        return {
            eyebrow:  "Weekly planner",
            title:    "My routines",
            subtitle: "Stay consistent — tap a routine for ideas, or add with +.",
        };
    }, [tab]);

    // ── Render ───────────────────────────────────────────────────────────────

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

                {/* ── Segment control ── */}
                <View style={[styles.segmentTrack, isDark && styles.segmentTrackDark]}>
                    {TABS.map((t) => {
                        const active = tab === t.key;
                        return (
                            <Pressable
                                key={t.key}
                                onPress={() => setTab(t.key)}
                                style={({ pressed }) => [
                                    styles.segmentCell,
                                    active && styles.segmentCellActive,
                                    pressed && !active && styles.segmentCellPressed,
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

                {tab === "planner" && (
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
                )}

                {loading ? <Loader /> : null}
                {error    ? <Text style={styles.errorText}>{error}</Text> : null}

                {/* ══════════════════════════════════════════
                    SCHEDULE TAB — AI timeline planner
                ══════════════════════════════════════════ */}
                {tab === "schedule" && !loading && (
                    <ScrollView
                        style={styles.tabBody}
                        contentContainerStyle={{ paddingBottom: scrollBottomInset }}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={handleRefresh}
                            />
                        }
                        showsVerticalScrollIndicator={false}
                    >
                        {/* AI status banner */}
                        <AIStatusBanner
                            meta={aiMeta}
                            palette={palette}
                            styles={styles}
                        />

                        {/* Loading AI overlay for first-time */}
                        {aiLoading && !aiSchedule && (
                            <View style={styles.aiLoadingRow}>
                                <Ionicons
                                    name="sparkles"
                                    size={14}
                                    color={palette.oceanBlue}
                                />
                                <Text style={styles.aiLoadingText}>
                                    AI is personalizing your day…
                                </Text>
                            </View>
                        )}

                        {/* Period sections */}
                        {PERIODS.map((period) => {
                            const slots = activeSchedule[period.key] ?? [];
                            if (slots.length === 0) return null;
                            const isCurrent = period.key === currentPeriod;

                            return (
                                <View
                                    key={period.key}
                                    style={[
                                        styles.periodSection,
                                        isCurrent && styles.periodSectionActive,
                                    ]}
                                >
                                    <PeriodHeader
                                        period={period}
                                        isCurrent={isCurrent}
                                        styles={styles}
                                        palette={palette}
                                    />

                                    <View style={styles.slotList}>
                                        {slots.map((slot) => (
                                            <ActivityCard
                                                key={slot.id}
                                                slot={slot}
                                                isDark={isDark}
                                                palette={palette}
                                                styles={styles}
                                                onPress={() => {
                                                    // Track interaction for AI learning
                                                    createInteraction({
                                                        placeId:    slot.place?.placeId ?? `activity-${slot.activityType}`,
                                                        actionType: INTERACTION_TYPES.CLICK,
                                                        metadata: {
                                                            source:       "ai_schedule_tab",
                                                            activityType: slot.activityType,
                                                            period:       slot.period,
                                                            timeOfDay:    slot.time,
                                                            slotSource:   slot.source,
                                                            routineId:    slot.routineId ?? null,
                                                            hourOfDay:    new Date().getHours(),
                                                            dayOfWeek:    new Date().getDay(),
                                                        },
                                                    }).catch(() => null);
                                                    navigateToActivityPicks({
                                                        title:              slot.title,
                                                        activityType:       slot.activityType,
                                                        timeOfDay:          slot.period,
                                                        locationPreference: slot.locationPreference ?? "any",
                                                        budgetRange:        slot.budgetRange ?? "medium",
                                                    });
                                                }}
                                                onPlacePress={() =>
                                                    slot.place ? openPlaceDetail(slot.place) : null
                                                }
                                            />
                                        ))}
                                    </View>
                                </View>
                            );
                        })}

                        {/* Empty state */}
                        {Object.values(activeSchedule).every(a => a.length === 0) && (
                            <EmptyState message="No schedule yet. Add routines in the Planner tab." />
                        )}
                    </ScrollView>
                )}

                {/* ══════════════════════════════════════════
                    RECOMMENDED TAB
                ══════════════════════════════════════════ */}
                {tab === "recommendations" && (
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
                                onPress={() => {
                                    createInteraction({
                                        placeId:    item.placeId,
                                        actionType: INTERACTION_TYPES.CLICK,
                                        metadata:   { source: "routines_rec_tab", place: item },
                                    }).catch(() => null);
                                    const parent = navigation.getParent?.();
                                    const target = parent?.navigate ?? navigation.navigate.bind(navigation);
                                    target("PlaceDetail", { place: item });
                                }}
                            />
                        )}
                    />
                )}

                {/* ══════════════════════════════════════════
                    PLANNER TAB
                ══════════════════════════════════════════ */}
                {tab === "planner" && (
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
                                                title:              `${formatLabel(item.weekday)} · ${formatLabel(item.activityType)}`,
                                                activityType:       item.activityType,
                                                timeOfDay:          item.timeOfDay,
                                                locationPreference: item.locationPreference,
                                                budgetRange:        item.budgetRange,
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
                                                    {formatLabel(item.locationPreference)}
                                                </Text>
                                            </View>
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>
                                                    {formatLabel(item.budgetRange)}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.cardHint}>
                                            Tap for places &amp; filters
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        style={styles.deletePill}
                                        onPress={() => handleDeleteRoutine(item.id)}
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
                )}

                {/* FAB for planner tab */}
                {tab === "planner" && (
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
                            <Ionicons name="add" size={24} color={palette.iceWhite} />
                        </LinearGradient>
                    </Pressable>
                )}

                {/* ── Add Routine Modal ── */}
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
                                            <Text style={styles.modalTitle}>New routine</Text>
                                            <Pressable
                                                onPress={closeAddRoutineModal}
                                                hitSlop={12}
                                            >
                                                <Ionicons
                                                    name="close"
                                                    size={26}
                                                    color={palette.textSecondary}
                                                />
                                            </Pressable>
                                        </View>
                                        <Text style={styles.modalHint}>
                                            Choose each field to create a routine that
                                            matches your real schedule.
                                        </Text>
                                        <FieldRow
                                            label="Day"
                                            valueLabel={formatLabel(draft.weekday)}
                                            onPress={() => setPicker("weekday")}
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Time"
                                            valueLabel={formatLabel(draft.timeOfDay)}
                                            onPress={() => setPicker("timeOfDay")}
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Activity"
                                            valueLabel={formatLabel(draft.activityType)}
                                            onPress={() => setPicker("activityType")}
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Place vibe"
                                            valueLabel={formatLabel(draft.locationPreference)}
                                            onPress={() => setPicker("locationPreference")}
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Budget"
                                            valueLabel={formatLabel(draft.budgetRange)}
                                            onPress={() => setPicker("budgetRange")}
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <Pressable
                                            style={styles.modalCtaWrap}
                                            onPress={handleAddRoutine}
                                            disabled={busy}
                                        >
                                            <LinearGradient
                                                colors={gradients.primaryButtonMint}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={styles.modalCta}
                                            >
                                                <Text style={styles.modalCtaText}>
                                                    {busy ? "Adding…" : "Add routine"}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safeArea:  { flex: 1, backgroundColor: palette.pageTop },
        screen:    { flex: 1, paddingHorizontal: 16 },

        // Segment
        segmentTrack: {
            flexDirection: "row", alignItems: "stretch",
            marginTop: 10, marginBottom: 8,
            padding: 3, borderRadius: 11,
            borderWidth: 1, borderColor: palette.borderSoft,
            backgroundColor: "rgba(255,255,255,0.45)",
        },
        segmentTrackDark: {
            backgroundColor: "rgba(18,35,58,0.55)",
            borderColor: "rgba(120,199,255,0.2)",
        },
        segmentCell: {
            flex: 1, minHeight: 32, maxHeight: 36,
            paddingVertical: 6, paddingHorizontal: 6,
            borderRadius: 8, alignItems: "center", justifyContent: "center",
        },
        segmentCellActive: {
            backgroundColor: palette.surfaceStrong,
            shadowColor: "#0A3A5C", shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
        },
        segmentCellPressed: { opacity: 0.92 },
        segmentLabel: {
            fontSize: 11, fontWeight: "600", letterSpacing: 0.15,
            color: palette.textMuted, textAlign: "center",
        },
        segmentLabelActive: { color: palette.textPrimary, fontWeight: "700" },

        // Stats (planner)
        statsRow: { marginTop: 4, flexDirection: "row", gap: 10 },
        statCard: {
            flex: 1, borderRadius: 18, padding: 14,
            backgroundColor: palette.surface,
            borderWidth: 1, borderColor: palette.borderStrong,
        },
        statMain: { color: palette.oceanBlue, fontSize: 28, fontWeight: "800" },
        statLabel: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },

        errorText: { color: palette.danger, marginTop: 8, fontSize: 12 },

        tabBody: { flex: 1 },
        listContent: { paddingTop: 16, paddingBottom: 24, gap: 12 },

        // ── AI status banner ──────────────────────────────────────────────────
        aiBanner: {
            flexDirection: "row", alignItems: "center",
            marginTop: 10, marginBottom: 4,
            paddingHorizontal: 12, paddingVertical: 8,
            borderRadius: 12, borderWidth: 1,
            backgroundColor: isDark ? "rgba(18,35,58,0.5)" : "rgba(255,255,255,0.65)",
            gap: 6,
        },
        aiBannerDot: { width: 7, height: 7, borderRadius: 4 },
        aiBannerText: { fontSize: 12, fontWeight: "700" },
        aiBannerSub:  { fontSize: 11, color: palette.textMuted },

        aiLoadingRow: {
            flexDirection: "row", alignItems: "center", gap: 6,
            paddingVertical: 6, paddingHorizontal: 4, marginBottom: 4,
        },
        aiLoadingText: { color: palette.oceanBlue, fontSize: 12, fontWeight: "600" },

        // ── Period section ────────────────────────────────────────────────────
        periodSection: {
            marginTop: 14,
            borderRadius: 20,
            backgroundColor: isDark ? "rgba(22,44,70,0.7)" : "rgba(255,255,255,0.78)",
            borderWidth: 1, borderColor: palette.borderSoft,
            overflow: "hidden",
            shadowColor: "#0A3A5C",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
        },
        periodSectionActive: {
            borderColor: palette.oceanBlue,
            shadowColor: palette.oceanBlue,
            shadowOpacity: 0.15,
        },
        periodHeader: {
            flexDirection: "row", alignItems: "center",
            paddingHorizontal: 14, paddingVertical: 11,
            borderBottomWidth: 1, borderBottomColor: palette.borderSoft,
            gap: 7,
        },
        periodDot: { width: 8, height: 8, borderRadius: 4 },
        periodLabel: {
            fontSize: 14, fontWeight: "800", letterSpacing: 0.3,
        },
        periodTimeRange: {
            flex: 1, fontSize: 11, color: palette.textMuted, fontWeight: "500",
        },
        nowBadge: {
            paddingHorizontal: 7, paddingVertical: 2,
            borderRadius: 999, borderWidth: 1,
        },
        nowBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

        slotList: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 10 },

        // ── Activity card ─────────────────────────────────────────────────────
        activityCard: {
            flexDirection: "row", alignItems: "flex-start",
            gap: 12, padding: 12, borderRadius: 16,
            backgroundColor: isDark ? "rgba(18,35,58,0.5)" : "rgba(248,254,255,0.9)",
            borderWidth: 1, borderColor: palette.borderSoft,
        },
        activityCardPressed: { opacity: 0.88 },
        activityIconWrap: {
            width: 46, height: 46, borderRadius: 14,
            alignItems: "center", justifyContent: "center",
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
        },
        microDot: {
            position: "absolute", top: -4, right: -4,
            width: 16, height: 16, borderRadius: 8,
            backgroundColor: "#8B5CF6",
            alignItems: "center", justifyContent: "center",
            borderWidth: 1.5, borderColor: isDark ? "#0f172a" : "#fff",
        },
        aiPickPill: {
            paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
            backgroundColor: isDark ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.12)",
            borderWidth: 1, borderColor: "rgba(139,92,246,0.4)",
        },
        aiPickPillText: {
            fontSize: 10, fontWeight: "800", color: "#8B5CF6", letterSpacing: 0.3,
        },
        activityContent: { flex: 1 },
        activityTitleRow: {
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        },
        activityTitle: {
            flex: 1, color: palette.textPrimary, fontSize: 16, fontWeight: "800",
        },
        activityMetaRow: {
            flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3,
        },
        activityTime: {
            color: palette.textMuted, fontSize: 12, fontWeight: "600",
        },
        activityDot: { color: palette.textMuted, fontSize: 12 },
        activityDuration: { color: palette.textMuted, fontSize: 12 },

        // Place chip
        placeChip: {
            flexDirection: "row", alignItems: "center", gap: 5,
            marginTop: 7, paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 10, borderWidth: 1,
            borderColor: `${palette.oceanBlue}35`,
            backgroundColor: isDark ? "rgba(38,154,227,0.1)" : "rgba(56,174,255,0.08)",
        },
        placeChipName: {
            flex: 1, color: palette.oceanBlue, fontSize: 12, fontWeight: "700",
        },
        placeChipDistance: { color: palette.textMuted, fontSize: 11 },
        placeChipPrice: {
            color: palette.emerald, fontSize: 11, fontWeight: "700", marginLeft: 2,
        },

        activityHint: {
            marginTop: 6, color: palette.oceanBlue, fontSize: 11, fontWeight: "700",
        },
        activityReason: {
            marginTop: 6, color: palette.textMuted, fontSize: 11,
            fontStyle: "italic", lineHeight: 15,
        },
        badgesRow: {
            flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7,
        },

        // ── Planner cards ─────────────────────────────────────────────────────
        card: {
            borderRadius: 18, padding: 14,
            backgroundColor: palette.surface,
            borderWidth: 1, borderColor: palette.borderStrong,
            flexDirection: "row", justifyContent: "space-between",
            alignItems: "flex-start", gap: 10,
        },
        cardMain:    { flex: 1 },
        cardPressed: { opacity: 0.92 },
        cardHint: {
            marginTop: 8, color: palette.oceanBlue, fontSize: 11, fontWeight: "700",
        },
        weekday: {
            color: palette.emerald, fontSize: 12, fontWeight: "800",
            textTransform: "uppercase", letterSpacing: 0.7,
        },
        period:   { marginTop: 6, color: palette.textSecondary, fontSize: 12 },
        activity: { marginTop: 4, color: palette.textPrimary, fontSize: 22, fontWeight: "800" },
        badge: {
            borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
            borderWidth: 1, borderColor: palette.borderStrong,
            backgroundColor: palette.surfaceStrong,
        },
        badgeText: { color: palette.textSecondary, fontSize: 11, fontWeight: "700" },
        deletePill: {
            borderRadius: 999, borderWidth: 1, borderColor: palette.borderStrong,
            backgroundColor: palette.surfaceStrong,
            paddingHorizontal: 8, paddingVertical: 6,
        },

        // ── FAB ───────────────────────────────────────────────────────────────
        fab: {
            position: "absolute", right: 20,
            width: 52, height: 52, borderRadius: 26,
            overflow: "hidden", backgroundColor: "transparent",
            alignItems: "center", justifyContent: "center",
            zIndex: 40,
            shadowColor: "#269AE3", shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25, shadowRadius: 12, elevation: 16,
        },
        fabFill: {
            width: "100%", height: "100%", borderRadius: 26,
            alignItems: "center", justifyContent: "center",
        },

        // ── Modal ─────────────────────────────────────────────────────────────
        modalOverlay: {
            flex: 1, backgroundColor: "rgba(5,17,30,0.36)", justifyContent: "flex-end",
        },
        modalSafe:  { width: "100%" },
        modalCard: {
            backgroundColor: palette.surfaceStrong,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            borderWidth: 1, borderColor: palette.borderStrong,
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, minHeight: 380,
        },
        modalTopBar: {
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        },
        modalTitle: { color: palette.textPrimary, fontSize: 22, fontWeight: "900" },
        modalHint: {
            marginTop: 6, marginBottom: 10, color: palette.textSecondary,
            fontSize: 12, lineHeight: 18,
        },
        fieldRow: {
            borderWidth: 1, borderColor: palette.borderSoft,
            backgroundColor: palette.surface, borderRadius: 14,
            paddingHorizontal: 12, paddingVertical: 12,
            flexDirection: "row", alignItems: "center",
            justifyContent: "space-between", marginTop: 8,
        },
        fieldRowPressed: { opacity: 0.9 },
        fieldLabel: {
            color: palette.textMuted, fontSize: 12,
            textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700",
        },
        fieldRowRight: { flexDirection: "row", alignItems: "center", gap: 5 },
        fieldValue: { color: palette.textPrimary, fontSize: 14, fontWeight: "700" },
        modalCtaWrap: { marginTop: 14, borderRadius: 14, overflow: "hidden" },
        modalCta: {
            height: 48, borderRadius: 14, alignItems: "center",
            justifyContent: "center", flexDirection: "row", gap: 8,
        },
        modalCtaText: {
            color: palette.iceWhite, fontWeight: "800", letterSpacing: 0.4,
            textTransform: "uppercase", fontSize: 13,
        },

        // Picker
        pickerSheet:        { flex: 1, minHeight: 320 },
        pickerHeader:       { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
        pickerBack:         { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 4 },
        pickerBackText:     { color: palette.deepBlue, fontWeight: "700", fontSize: 13 },
        pickerTitle:        { color: palette.textPrimary, fontSize: 17, fontWeight: "800" },
        pickerScroll:       { flex: 1 },
        pickerScrollContent:{ paddingBottom: 16, gap: 8 },
        pickerOption: {
            borderWidth: 1, borderColor: palette.borderSoft,
            backgroundColor: palette.surface, borderRadius: 14,
            paddingHorizontal: 12, paddingVertical: 12,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        },
        pickerOptionSelected: {
            borderColor: palette.emerald,
            backgroundColor: "rgba(37,201,122,0.12)",
        },
        pickerOptionPressed:      { opacity: 0.9 },
        pickerOptionText:         { color: palette.textPrimary, fontSize: 15, fontWeight: "700" },
        pickerOptionTextSelected: { color: palette.emerald },
    });
}
