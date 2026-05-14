import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import PlaceCard from "../components/PlaceCard";
import Loader from "../components/Loader";
import { getProfile } from "../api/profileApi";
import {
    getRecommendations,
    parseRecommendationsResponse,
} from "../api/recommendationApi";
import { createInteraction } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { normalisePlace } from "../utils/recommendationPlaces";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";
import { getLocationQueryParams } from "../utils/locationForApi";

// ─── In-memory recommendation cache (5-minute TTL) ────────────────────────────

const REC_CACHE     = new Map();
const REC_CACHE_TTL = 5 * 60 * 1000;

function cacheGet(key) {
    const entry = REC_CACHE.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > REC_CACHE_TTL) {
        REC_CACHE.delete(key);
        return null;
    }
    return entry.data;
}

function cacheSet(key, data) {
    REC_CACHE.set(key, { data, ts: Date.now() });
}

// ─── Static data ──────────────────────────────────────────────────────────────

const LOCATION_FILTERS = [
    { id: "any", label: "Any" },
    { id: "indoor", label: "Indoor" },
    { id: "outdoor", label: "Outdoor" },
];

const BUDGET_FILTERS = [
    { id: "any", label: "Any" },
    { id: "low", label: "Budget" },
    { id: "medium", label: "Mid" },
    { id: "high", label: "Premium" },
];

const RANK_COLORS = ["#10B981", "#3B82F6", "#8B5CF6"];
const RANK_LABELS = ["Best match", "Great pick", "Also good"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSlot(timeOfDay) {
    const MAP = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" };
    return MAP[(timeOfDay || "").toLowerCase()] ?? "Today";
}

function extractMatchPct(scoreStr) {
    if (!scoreStr) return null;
    const m = String(scoreStr).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function mealIdeasFor(activityType, mealPreferences) {
    const t    = (activityType || "").toLowerCase();
    const prefs = Array.isArray(mealPreferences) ? mealPreferences : [];
    const lines = [];
    if (t === "restaurant" || t === "coffee") {
        lines.push("Pick something that fits your energy for this slot.");
        if (prefs.includes("vegetarian")) lines.push("Vegetarian-friendly spots score higher for you.");
        if (prefs.includes("quick_bites")) lines.push("Quick service works well between commitments.");
    } else if (t === "gym" || t === "yoga") {
        lines.push("Hydrate well; light protein after training.");
    } else {
        lines.push("Keep snacks simple: fruit, yogurt, or a small sandwich.");
    }
    if (prefs.includes("high_protein")) lines.push("Lean protein helps hit your usual preference.");
    return lines.slice(0, 5);
}

function applyFilters(places, activityType, locationPref, budgetPref) {
    let out = places.map((p, i) => normalisePlace(p, i));
    const t = (activityType || "").toLowerCase();

    if (t && t !== "work" && t !== "study") {
        const narrowed = out.filter((p) => {
            const ty  = `${p.type ?? ""}`.toLowerCase();
            const cat = `${p.category ?? ""}`.toLowerCase();
            const nm  = `${p.name ?? ""}`.toLowerCase();
            return ty.includes(t) || cat.includes(t) || nm.includes(t) || t.includes(ty);
        });
        if (narrowed.length > 0) out = narrowed;
    }

    if (locationPref && locationPref !== "any") {
        const narrowed = out.filter((p) => {
            const v  = `${p.locationVibe ?? p.locationPreference ?? ""}`.toLowerCase();
            const ty = `${p.type ?? ""}`.toLowerCase();
            if (locationPref === "indoor")
                return v === "indoor" || ["gym", "cinema", "coffee", "restaurant"].some(x => ty.includes(x));
            if (locationPref === "outdoor")
                return v === "outdoor" || ty.includes("park") || ty.includes("walk");
            return true;
        });
        if (narrowed.length > 0) out = narrowed;
    }

    if (budgetPref && budgetPref !== "any") {
        const narrowed = out.filter((p) => {
            const pr = `${p.priceRange ?? p.budgetHint ?? p.priceLevel ?? ""}`.toLowerCase();
            return pr === budgetPref || pr.includes(budgetPref);
        });
        if (narrowed.length > 0) out = narrowed;
    }

    // Limit to top 3
    return out.slice(0, 3);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AITopPicksHeader({ places, activityType, timeOfDay, palette, isDark, styles }) {
    const topScore = useMemo(() => {
        if (!places.length) return null;
        return extractMatchPct(places[0]?.score);
    }, [places]);

    const hasBudgetMatch  = places.some(p => p.matches?.budget === true || p.budgetFit === true);
    const hasReason       = places.some(p => p.reason || p.aiInsight);
    const count           = places.length;

    if (!count) return null;

    return (
        <View style={[
            styles.aiHeader,
            {
                backgroundColor: isDark ? "rgba(20,40,70,0.72)" : "rgba(235,248,255,0.9)",
                borderColor: isDark ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.25)",
            },
        ]}>
            <View style={styles.aiHeaderTop}>
                <View style={styles.aiHeaderLeft}>
                    <Ionicons name="sparkles" size={15} color={palette.oceanBlue} />
                    <Text style={[styles.aiHeaderTitle, { color: palette.textPrimary }]}>
                        Top {count} for you
                    </Text>
                </View>
                {topScore ? (
                    <View style={[styles.topScorePill, { backgroundColor: "rgba(16,185,129,0.18)", borderColor: "rgba(16,185,129,0.4)" }]}>
                        <Text style={[styles.topScoreText, { color: "#059669" }]}>
                            {topScore}% top match
                        </Text>
                    </View>
                ) : null}
            </View>
            <Text style={[styles.aiHeaderSub, { color: palette.textSecondary }]}>
                {`Personalized for your ${formatSlot(timeOfDay).toLowerCase()} ${activityType} — ranked by AI confidence`}
            </Text>
            <View style={styles.aiCriteriaRow}>
                <View style={styles.criteriaPill}>
                    <Ionicons name="location-outline" size={11} color={palette.oceanBlue} />
                    <Text style={[styles.criteriaText, { color: palette.oceanBlue }]}>Near you</Text>
                </View>
                {hasBudgetMatch && (
                    <View style={[styles.criteriaPill, { borderColor: "rgba(16,185,129,0.4)", backgroundColor: "rgba(16,185,129,0.1)" }]}>
                        <Ionicons name="checkmark-circle" size={11} color="#059669" />
                        <Text style={[styles.criteriaText, { color: "#059669" }]}>Budget match</Text>
                    </View>
                )}
                {hasReason && (
                    <View style={[styles.criteriaPill, { borderColor: "rgba(139,92,246,0.4)", backgroundColor: "rgba(139,92,246,0.1)" }]}>
                        <Ionicons name="flash" size={11} color="#7C3AED" />
                        <Text style={[styles.criteriaText, { color: "#7C3AED" }]}>AI reasoned</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

function RankedCardWrapper({ rank, children, palette, isDark, styles }) {
    const color = RANK_COLORS[rank] ?? "#6366F1";
    const label = RANK_LABELS[rank] ?? `#${rank + 1}`;
    return (
        <View style={styles.rankedWrap}>
            <View style={[styles.rankBadge, { backgroundColor: color }]}>
                <Text style={styles.rankBadgeText}>#{rank + 1}</Text>
            </View>
            <View style={[styles.rankLabel, { borderColor: `${color}40`, backgroundColor: `${color}12` }]}>
                <Text style={[styles.rankLabelText, { color }]}>{label}</Text>
            </View>
            {children}
        </View>
    );
}

function MatchBreakdown({ place, palette, isDark, styles }) {
    const score   = extractMatchPct(place?.score);
    const budget  = place?.matches?.budget === true || place?.budgetFit === true;
    const religion = place?.matches?.religion === true;
    const reason  = place?.reason ?? place?.aiInsight ?? null;

    if (!score && !budget && !reason) return null;

    return (
        <View style={[
            styles.matchBreakdown,
            {
                backgroundColor: isDark ? "rgba(12,25,48,0.7)" : "rgba(240,250,255,0.9)",
                borderColor: isDark ? "rgba(56,130,230,0.2)" : "rgba(10,100,200,0.15)",
            },
        ]}>
            {score ? (
                <View style={styles.matchScoreRow}>
                    <View style={styles.matchScoreCircle}>
                        <Text style={styles.matchScoreNum}>{score}</Text>
                        <Text style={styles.matchScorePct}>%</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.matchScoreLabel, { color: palette.textPrimary }]}>
                            AI match score
                        </Text>
                        {reason ? (
                            <Text style={[styles.matchScoreReason, { color: palette.textSecondary }]} numberOfLines={2}>
                                {reason}
                            </Text>
                        ) : null}
                    </View>
                </View>
            ) : reason ? (
                <View style={styles.matchReasonRow}>
                    <Ionicons name="sparkles" size={13} color={palette.oceanBlue} />
                    <Text style={[styles.matchReasonText, { color: palette.textSecondary }]} numberOfLines={2}>
                        {reason}
                    </Text>
                </View>
            ) : null}

            {(budget || religion) && (
                <View style={styles.matchCriteriaRow}>
                    {budget && (
                        <View style={[styles.matchChip, { backgroundColor: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.35)" }]}>
                            <Ionicons name="checkmark-circle" size={10} color="#059669" />
                            <Text style={[styles.matchChipText, { color: "#059669" }]}>Matches your budget</Text>
                        </View>
                    )}
                    {religion && (
                        <View style={[styles.matchChip, { backgroundColor: "rgba(139,92,246,0.12)", borderColor: "rgba(139,92,246,0.35)" }]}>
                            <Ionicons name="checkmark-circle" size={10} color="#7C3AED" />
                            <Text style={[styles.matchChipText, { color: "#7C3AED" }]}>Faith-aligned</Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ActivityRecommendationsScreen() {
    const navigation = useNavigation();
    const route      = useRoute();
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

    const {
        title            = "Ideas for you",
        activityType     = "social",
        timeOfDay        = "morning",
        locationPreference = "any",
        budgetRange      = "medium",
    } = route.params ?? {};

    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState("");
    const [rawPlaces,     setRawPlaces]     = useState([]);
    const [profile,       setProfile]       = useState(null);
    const [mode,          setMode]          = useState("places");
    const [locFilter,     setLocFilter]     = useState((locationPreference || "any").toLowerCase());
    const [budgetFilter,  setBudgetFilter]  = useState((budgetRange || "medium").toLowerCase());

    const headerAnim = useRef(new Animated.Value(0)).current;

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const loc      = await getLocationQueryParams(5);
            const cacheKey = `${activityType}|${loc.lat ?? "x"}|${loc.lng ?? "x"}`;
            const cached   = cacheGet(cacheKey);

            let places  = [];
            let prof    = profile;

            if (cached) {
                places = cached.places;
                prof   = cached.profile ?? profile;
            } else {
                const [recEnvelope, profileEnvelope] = await Promise.all([
                    getRecommendations({ ...loc, fast: "true" }),
                    getProfile(),
                ]);
                const { recommendations } = parseRecommendationsResponse(recEnvelope);
                places = Array.isArray(recommendations) ? recommendations : [];
                prof   = unwrapApiData(profileEnvelope, {});
                cacheSet(cacheKey, { places, profile: prof });
            }

            setRawPlaces(places);
            setProfile(prof);

            Animated.timing(headerAnim, {
                toValue: 1, duration: 400, useNativeDriver: true,
            }).start();
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load ideas."));
        } finally {
            setLoading(false);
        }
    }, [activityType]);   // only re-fetch when activity changes

    useEffect(() => {
        load();
    }, [load]);

    const filteredPlaces = useMemo(
        () => applyFilters(rawPlaces, activityType, locFilter, budgetFilter),
        [rawPlaces, activityType, locFilter, budgetFilter],
    );

    const mealLines = useMemo(
        () => mealIdeasFor(activityType, profile?.mealPreferences),
        [activityType, profile?.mealPreferences],
    );

    function openPlace(place, rank) {
        createInteraction({
            placeId:    place.placeId,
            actionType: INTERACTION_TYPES.CLICK,
            metadata: {
                source:      "activity_picks",
                rank,
                activityType,
                timeOfDay,
                matchScore:  extractMatchPct(place.score),
                place,
            },
        }).catch(() => null);
        navigation.navigate("PlaceDetail", { place });
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={gradients.appBackground} style={styles.screen}>

                {/* ── Top bar ── */}
                <View style={styles.topBar}>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        style={styles.backBtn}
                        hitSlop={12}
                    >
                        <Ionicons name="chevron-back" size={26} color={palette.deepBlue} />
                    </Pressable>
                    <View style={styles.topBarText}>
                        <Text style={styles.screenTitle} numberOfLines={2}>{title}</Text>
                        <Text style={styles.screenMeta}>
                            {`${formatSlot(timeOfDay)} · ${activityType}`}
                        </Text>
                    </View>
                </View>

                {/* ── Mode toggle ── */}
                <View style={styles.modeRow}>
                    {["places", "meals"].map((m) => (
                        <Pressable
                            key={m}
                            onPress={() => setMode(m)}
                            style={[styles.modeChip, mode === m && styles.modeChipOn]}
                        >
                            <Ionicons
                                name={m === "places" ? "location-outline" : "restaurant-outline"}
                                size={13}
                                color={mode === m ? palette.deepBlue : palette.textMuted}
                            />
                            <Text style={[styles.modeChipText, mode === m && styles.modeChipTextOn]}>
                                {m === "places" ? "Places" : "Meals & tips"}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {/* ── Filter row ── */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScroll}
                >
                    <Text style={styles.filterLabel}>Place</Text>
                    {LOCATION_FILTERS.map((f) => (
                        <Pressable
                            key={f.id}
                            onPress={() => setLocFilter(f.id)}
                            style={[styles.filterChip, locFilter === f.id && styles.filterChipOn]}
                        >
                            <Text style={[styles.filterChipText, locFilter === f.id && styles.filterChipTextOn]}>
                                {f.label}
                            </Text>
                        </Pressable>
                    ))}
                    <Text style={[styles.filterLabel, { marginLeft: 8 }]}>Budget</Text>
                    {BUDGET_FILTERS.map((f) => (
                        <Pressable
                            key={f.id}
                            onPress={() => setBudgetFilter(f.id)}
                            style={[styles.filterChip, budgetFilter === f.id && styles.filterChipOn]}
                        >
                            <Text style={[styles.filterChipText, budgetFilter === f.id && styles.filterChipTextOn]}>
                                {f.label}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                {loading ? <Loader /> : null}
                {error   ? <Text style={styles.errorText}>{error}</Text> : null}

                {/* ── Meals tab ── */}
                {mode === "meals" && (
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.mealContent}>
                        {mealLines.map((line, i) => (
                            <View key={i} style={[styles.mealCard, { backgroundColor: isDark ? "rgba(22,44,70,0.8)" : "rgba(255,255,255,0.92)", borderColor: palette.borderStrong }]}>
                                <Ionicons name="restaurant-outline" size={22} color={palette.emerald} />
                                <Text style={[styles.mealText, { color: palette.textPrimary }]}>{line}</Text>
                            </View>
                        ))}
                    </ScrollView>
                )}

                {/* ── Places tab ── */}
                {mode === "places" && !loading && (
                    <FlatList
                        data={filteredPlaces}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListHeaderComponent={() => (
                            filteredPlaces.length > 0 ? (
                                <Animated.View style={{ opacity: headerAnim }}>
                                    <AITopPicksHeader
                                        places={filteredPlaces}
                                        activityType={activityType}
                                        timeOfDay={timeOfDay}
                                        palette={palette}
                                        isDark={isDark}
                                        styles={styles}
                                    />
                                </Animated.View>
                            ) : null
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyWrap}>
                                <Ionicons name="search-outline" size={36} color={palette.textMuted} />
                                <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                                    No spots match these filters — try Any or a different budget.
                                </Text>
                            </View>
                        }
                        renderItem={({ item, index }) => (
                            <RankedCardWrapper
                                rank={index}
                                palette={palette}
                                isDark={isDark}
                                styles={styles}
                            >
                                <PlaceCard
                                    place={item}
                                    onPress={() => openPlace(item, index + 1)}
                                />
                                <MatchBreakdown
                                    place={item}
                                    palette={palette}
                                    isDark={isDark}
                                    styles={styles}
                                />
                            </RankedCardWrapper>
                        )}
                    />
                )}
            </LinearGradient>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: palette.pageTop },
        screen:   { flex: 1, paddingHorizontal: 16 },

        // Top bar
        topBar:      { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4, marginBottom: 12 },
        backBtn:     { paddingVertical: 4 },
        topBarText:  { flex: 1 },
        screenTitle: { color: palette.textPrimary, fontSize: 22, fontWeight: "800" },
        screenMeta:  { marginTop: 4, color: palette.textSecondary, fontSize: 13 },

        // Mode chips
        modeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
        modeChip: {
            flexDirection: "row", alignItems: "center", gap: 5,
            paddingHorizontal: 14, paddingVertical: 8,
            borderRadius: 999, borderWidth: 1,
            borderColor: palette.borderStrong, backgroundColor: palette.surface,
        },
        modeChipOn:     { borderColor: palette.oceanBlue, backgroundColor: "rgba(31,159,234,0.14)" },
        modeChipText:   { color: palette.textSecondary, fontWeight: "700", fontSize: 13 },
        modeChipTextOn: { color: palette.deepBlue },

        // Filter scroll
        filterScroll: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 12 },
        filterLabel:  { color: palette.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
        filterChip: {
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 999, borderWidth: 1,
            borderColor: palette.borderStrong, backgroundColor: palette.surface,
        },
        filterChipOn:     { borderColor: palette.emerald, backgroundColor: "rgba(38,201,122,0.12)" },
        filterChipText:   { color: palette.textSecondary, fontSize: 12, fontWeight: "700" },
        filterChipTextOn: { color: palette.deepBlue },

        errorText: { color: palette.danger, fontSize: 12, marginBottom: 8 },

        // AI header
        aiHeader: {
            borderRadius: 16, borderWidth: 1,
            padding: 14, marginBottom: 14,
        },
        aiHeaderTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
        aiHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
        aiHeaderTitle: { fontSize: 15, fontWeight: "800" },
        aiHeaderSub:   { fontSize: 12, lineHeight: 17, marginBottom: 10 },
        topScorePill: {
            paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: 999, borderWidth: 1,
        },
        topScoreText: { fontSize: 11, fontWeight: "800" },
        aiCriteriaRow:  { flexDirection: "row", flexWrap: "wrap", gap: 6 },
        criteriaPill: {
            flexDirection: "row", alignItems: "center", gap: 4,
            paddingHorizontal: 8, paddingVertical: 4,
            borderRadius: 999, borderWidth: 1,
            borderColor: `${palette.oceanBlue}40`,
            backgroundColor: `${palette.oceanBlue}12`,
        },
        criteriaText: { fontSize: 10, fontWeight: "700" },

        // Ranked card wrapper
        rankedWrap: { marginBottom: 4, position: "relative" },
        rankBadge: {
            position: "absolute", top: 10, left: -4,
            zIndex: 10, paddingHorizontal: 8, paddingVertical: 3,
            borderRadius: 8,
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
        },
        rankBadgeText:  { color: "#FFF", fontSize: 11, fontWeight: "900" },
        rankLabel: {
            alignSelf: "flex-start", marginLeft: 26, marginBottom: 4,
            paddingHorizontal: 9, paddingVertical: 3,
            borderRadius: 999, borderWidth: 1,
        },
        rankLabelText: { fontSize: 10, fontWeight: "700" },

        // Match breakdown card
        matchBreakdown: {
            marginTop: -10, marginBottom: 16,
            borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
            borderWidth: 1, borderTopWidth: 0,
            paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10,
        },
        matchScoreRow:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
        matchScoreCircle: {
            width: 52, height: 52, borderRadius: 26,
            backgroundColor: "rgba(16,185,129,0.15)",
            borderWidth: 2, borderColor: "rgba(16,185,129,0.4)",
            alignItems: "center", justifyContent: "center",
            flexDirection: "row",
        },
        matchScoreNum:    { color: "#059669", fontSize: 18, fontWeight: "900" },
        matchScorePct:    { color: "#059669", fontSize: 11, fontWeight: "700", alignSelf: "flex-end", marginBottom: 2 },
        matchScoreLabel:  { fontSize: 13, fontWeight: "700", marginBottom: 2 },
        matchScoreReason: { fontSize: 12, lineHeight: 17 },
        matchReasonRow:   { flexDirection: "row", alignItems: "flex-start", gap: 6 },
        matchReasonText:  { flex: 1, fontSize: 12, lineHeight: 17 },
        matchCriteriaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
        matchChip: {
            flexDirection: "row", alignItems: "center", gap: 4,
            paddingHorizontal: 8, paddingVertical: 3,
            borderRadius: 999, borderWidth: 1,
        },
        matchChipText: { fontSize: 10, fontWeight: "700" },

        // List
        listContent: { paddingBottom: 32, paddingTop: 4 },

        // Empty state
        emptyWrap: {
            alignItems: "center", paddingTop: 40, gap: 12,
        },
        emptyText: {
            fontSize: 14, textAlign: "center", paddingHorizontal: 20, lineHeight: 21,
        },

        // Meals
        mealContent: { gap: 10, paddingBottom: 28 },
        mealCard: {
            flexDirection: "row", gap: 12, alignItems: "flex-start",
            borderRadius: 16, borderWidth: 1, padding: 14,
        },
        mealText: { flex: 1, fontSize: 15, lineHeight: 22 },
    });
}
