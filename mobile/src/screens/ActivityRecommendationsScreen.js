import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import {
    createInteraction,
} from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { normalisePlace } from "../utils/recommendationPlaces";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

const LOCATION_FILTERS = [
    { id: "any", label: "Any" },
    { id: "indoor", label: "Indoor" },
    { id: "outdoor", label: "Outdoor" },
];

const BUDGET_FILTERS = [
    { id: "any", label: "Any" },
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
];

function mealIdeasFor(activityType, mealPreferences) {
    const t = (activityType || "").toLowerCase();
    const prefs = Array.isArray(mealPreferences) ? mealPreferences : [];
    const lines = [];

    if (t === "restaurant" || t === "coffee") {
        lines.push("Pick something that fits your energy for this slot.");
        if (prefs.includes("vegetarian")) {
            lines.push("Vegetarian-friendly spots score higher for you.");
        }
        if (prefs.includes("quick_bites")) {
            lines.push("Quick service works well between commitments.");
        }
    } else if (t === "gym" || t === "yoga") {
        lines.push("Hydrate well; light protein after training.");
    } else {
        lines.push("Keep snacks simple: fruit, yogurt, or a small sandwich.");
    }
    if (prefs.includes("high_protein")) {
        lines.push("Lean protein helps hit your usual preference.");
    }
    return lines.slice(0, 5);
}

function applyPlaceFilters(places, activityType, locationPref, budgetPref) {
    let out = places.map((p, i) => normalisePlace(p, i));
    const t = (activityType || "").toLowerCase();

    if (t && t !== "work" && t !== "study") {
        const narrowed = out.filter((p) => {
            const ty = `${p.type ?? ""}`.toLowerCase();
            const cat = `${p.category ?? ""}`.toLowerCase();
            const name = `${p.name ?? ""}`.toLowerCase();
            return (
                ty.includes(t) ||
                cat.includes(t) ||
                name.includes(t) ||
                t.includes(ty)
            );
        });
        if (narrowed.length > 0) {
            out = narrowed;
        }
    }

    if (locationPref && locationPref !== "any") {
        const narrowed = out.filter((p) => {
            const v = `${p.locationVibe ?? p.locationPreference ?? ""}`.toLowerCase();
            const ty = `${p.type ?? ""}`.toLowerCase();
            if (locationPref === "indoor") {
                return (
                    v === "indoor" ||
                    ["gym", "cinema", "coffee", "restaurant"].some((x) =>
                        ty.includes(x),
                    )
                );
            }
            if (locationPref === "outdoor") {
                return v === "outdoor" || ty.includes("park") || ty.includes("walk");
            }
            return true;
        });
        if (narrowed.length > 0) {
            out = narrowed;
        }
    }

    if (budgetPref && budgetPref !== "any") {
        const narrowed = out.filter((p) => {
            const pr = `${p.priceRange ?? p.budgetHint ?? ""}`.toLowerCase();
            return pr === budgetPref || pr.includes(budgetPref);
        });
        if (narrowed.length > 0) {
            out = narrowed;
        }
    }

    return out;
}

export default function ActivityRecommendationsScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const {
        title = "Ideas for you",
        activityType = "social",
        timeOfDay = "morning",
        locationPreference = "any",
        budgetRange = "medium",
    } = route.params ?? {};

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [rawPlaces, setRawPlaces] = useState([]);
    const [profile, setProfile] = useState(null);
    const [mode, setMode] = useState("places");
    const [locFilter, setLocFilter] = useState(
        (locationPreference || "any").toLowerCase(),
    );
    const [budgetFilter, setBudgetFilter] = useState(
        (budgetRange || "any").toLowerCase(),
    );

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const [recEnvelope, profileEnvelope] = await Promise.all([
                getRecommendations(),
                getProfile(),
            ]);
            const { recommendations } =
                parseRecommendationsResponse(recEnvelope);
            const list = Array.isArray(recommendations) ? recommendations : [];
            setRawPlaces(list);
            setProfile(unwrapApiData(profileEnvelope, {}));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load ideas."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filteredPlaces = useMemo(
        () =>
            applyPlaceFilters(
                rawPlaces,
                activityType,
                locFilter,
                budgetFilter,
            ),
        [rawPlaces, activityType, locFilter, budgetFilter],
    );

    const mealLines = useMemo(
        () =>
            mealIdeasFor(
                activityType,
                profile?.mealPreferences,
            ),
        [activityType, profile?.mealPreferences],
    );

    async function openPlace(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.CLICK,
                metadata: {
                    source: "activity_picks",
                    activityType,
                    timeOfDay,
                    place,
                },
            });
        } catch {
            /* non-blocking */
        }
        navigation.navigate("PlaceDetail", { place });
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <View style={styles.topBar}>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        style={styles.backBtn}
                        hitSlop={12}
                    >
                        <Ionicons
                            name="chevron-back"
                            size={26}
                            color={palette.deepBlue}
                        />
                    </Pressable>
                    <View style={styles.topBarText}>
                        <Text style={styles.screenTitle} numberOfLines={2}>
                            {title}
                        </Text>
                        <Text style={styles.screenMeta}>
                            {`${formatSlot(timeOfDay)} · ${String(activityType)}`}
                        </Text>
                    </View>
                </View>

                <View style={styles.modeRow}>
                    {["places", "meals"].map((m) => (
                        <Pressable
                            key={m}
                            onPress={() => setMode(m)}
                            style={[
                                styles.modeChip,
                                mode === m && styles.modeChipOn,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.modeChipText,
                                    mode === m && styles.modeChipTextOn,
                                ]}
                            >
                                {m === "places" ? "Places" : "Meals & tips"}
                            </Text>
                        </Pressable>
                    ))}
                </View>

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
                            style={[
                                styles.filterChip,
                                locFilter === f.id && styles.filterChipOn,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.filterChipText,
                                    locFilter === f.id &&
                                        styles.filterChipTextOn,
                                ]}
                            >
                                {f.label}
                            </Text>
                        </Pressable>
                    ))}
                    <Text style={[styles.filterLabel, styles.filterLabelSp]}>
                        Budget
                    </Text>
                    {BUDGET_FILTERS.map((f) => (
                        <Pressable
                            key={f.id}
                            onPress={() => setBudgetFilter(f.id)}
                            style={[
                                styles.filterChip,
                                budgetFilter === f.id && styles.filterChipOn,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.filterChipText,
                                    budgetFilter === f.id &&
                                        styles.filterChipTextOn,
                                ]}
                            >
                                {f.label}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {mode === "meals" ? (
                    <ScrollView
                        style={styles.mealScroll}
                        contentContainerStyle={styles.mealContent}
                    >
                        {mealLines.map((line, i) => (
                            <View key={i} style={styles.mealCard}>
                                <Ionicons
                                    name="restaurant-outline"
                                    size={22}
                                    color={palette.emerald}
                                />
                                <Text style={styles.mealText}>{line}</Text>
                            </View>
                        ))}
                    </ScrollView>
                ) : (
                    <FlatList
                        data={filteredPlaces}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            !loading ? (
                                <Text style={styles.empty}>
                                    No spots match these filters — try Any /
                                    a different budget.
                                </Text>
                            ) : null
                        }
                        renderItem={({ item }) => (
                            <PlaceCard
                                place={item}
                                onPress={() => openPlace(item)}
                            />
                        )}
                    />
                )}
            </LinearGradient>
        </SafeAreaView>
    );
}

function formatSlot(timeOfDay) {
    const t = (timeOfDay || "").toLowerCase();
    if (t === "morning") {
        return "Morning";
    }
    if (t === "afternoon") {
        return "Afternoon";
    }
    if (t === "evening") {
        return "Evening";
    }
    return "Today";
}

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: palette.pageTop,
        },
        screen: {
            flex: 1,
            paddingHorizontal: 16,
        },
        topBar: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 4,
            marginBottom: 12,
        },
        backBtn: {
            paddingVertical: 4,
        },
        topBarText: {
            flex: 1,
        },
        screenTitle: {
            color: palette.textPrimary,
            fontSize: 22,
            fontWeight: "800",
        },
        screenMeta: {
            marginTop: 4,
            color: palette.textSecondary,
            fontSize: 13,
        },
        modeRow: {
            flexDirection: "row",
            gap: 10,
            marginBottom: 12,
        },
        modeChip: {
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
        },
        modeChipOn: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.14)",
        },
        modeChipText: {
            color: palette.textSecondary,
            fontWeight: "700",
            fontSize: 13,
        },
        modeChipTextOn: {
            color: palette.deepBlue,
        },
        filterScroll: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingBottom: 12,
            flexWrap: "nowrap",
        },
        filterLabel: {
            color: palette.textMuted,
            fontSize: 11,
            fontWeight: "800",
            textTransform: "uppercase",
        },
        filterLabelSp: {
            marginLeft: 8,
        },
        filterChip: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
        },
        filterChipOn: {
            borderColor: palette.emerald,
            backgroundColor: "rgba(38, 201, 122, 0.12)",
        },
        filterChipText: {
            color: palette.textSecondary,
            fontSize: 12,
            fontWeight: "700",
        },
        filterChipTextOn: {
            color: palette.deepBlue,
        },
        errorText: {
            color: palette.danger,
            fontSize: 12,
            marginBottom: 8,
        },
        listContent: {
            paddingBottom: 28,
        },
        mealScroll: {
            flex: 1,
        },
        mealContent: {
            gap: 10,
            paddingBottom: 28,
        },
        mealCard: {
            flexDirection: "row",
            gap: 12,
            alignItems: "flex-start",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 14,
        },
        mealText: {
            flex: 1,
            color: palette.textPrimary,
            fontSize: 15,
            lineHeight: 22,
        },
        empty: {
            color: palette.textSecondary,
            fontSize: 14,
            textAlign: "center",
            marginTop: 24,
            paddingHorizontal: 20,
        },
    });
}
