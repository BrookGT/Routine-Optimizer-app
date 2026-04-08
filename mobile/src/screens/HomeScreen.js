import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import PlaceCard from "../components/PlaceCard";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import TopGreetingBanner from "../components/TopGreetingBanner";
import { getProfile } from "../api/profileApi";
import {
    createInteraction,
    createInteractionsBatch,
} from "../api/interactionApi";
import {
    getRecommendations,
    parseRecommendationsResponse,
} from "../api/recommendationApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

function normalisePlace(item, index) {
    const id =
        item?.placeId ??
        item?.id ??
        item?.googlePlaceId ??
        `${item?.name ?? "place"}-${index}`;

    const numericScore =
        typeof item?.finalScore === "number"
            ? item.finalScore
            : typeof item?.score === "number"
              ? item.score
              : null;

    const score =
        typeof numericScore === "number"
            ? `${Math.max(1, Math.min(99, Math.round(numericScore)))}% match`
            : (item?.scoreLabel ?? "Top pick");

    const distance =
        item?.distanceText ??
        item?.distance ??
        (typeof item?.distanceKm === "number"
            ? `${item.distanceKm.toFixed(1)} km away`
            : "Nearby");

    return {
        ...item,
        id,
        placeId: id,
        type: item?.type ?? item?.category ?? "Place",
        name: item?.name ?? "Recommended place",
        description:
            item?.description ??
            item?.summary ??
            "Curated place recommendation for you.",
        score,
        distance,
    };
}

function getGreetingMeta(date, name) {
    const hour = date.getHours();
    const firstName = name?.trim() || "there";

    if (hour >= 5 && hour < 12) {
        return {
            greeting: `Good morning, ${firstName}`,
            headline: "Start your day with places that match your vibe",
        };
    }

    if (hour >= 12 && hour < 17) {
        return {
            greeting: `Good afternoon, ${firstName}`,
            headline: "Take a refreshing break with a great nearby spot",
        };
    }

    if (hour >= 17 && hour < 22) {
        return {
            greeting: `Good evening, ${firstName}`,
            headline: "Unwind tonight with handpicked places for you",
        };
    }

    return {
        greeting: `Good night, ${firstName}`,
        headline: "Late hours, calm energy, and recommendations just for you",
    };
}

export default function HomeScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [name, setName] = useState("there");
    const [places, setPlaces] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [now, setNow] = useState(() => new Date());

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const [profileEnvelope, recommendationsEnvelope] =
                await Promise.all([getProfile(), getRecommendations()]);

            const profile = unwrapApiData(profileEnvelope, {});
            const { recommendations } = parseRecommendationsResponse(
                recommendationsEnvelope,
            );
            const mapped = Array.isArray(recommendations)
                ? recommendations.map((item, index) =>
                      normalisePlace(item, index),
                  )
                : [];

            setName(profile?.name?.trim() || "there");
            setPlaces(mapped);

            if (mapped.length > 0) {
                const impressionItems = mapped.slice(0, 8).map((place) => ({
                    placeId: place.placeId,
                    actionType: INTERACTION_TYPES.VIEW,
                    metadata: {
                        source: "home_feed",
                        place,
                    },
                }));

                createInteractionsBatch(impressionItems).catch(() => null);
            }
        } catch (err) {
            setError(
                getApiErrorMessage(err, "Unable to load recommendations."),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date());
        }, 60000);

        return () => clearInterval(timer);
    }, []);

    async function handleRefresh() {
        try {
            setRefreshing(true);
            await fetchData();
        } finally {
            setRefreshing(false);
        }
    }

    async function handleOpenDetail(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.CLICK,
                metadata: {
                    source: "home_feed",
                    place,
                },
            });
        } catch {
            // Non-blocking: still open detail screen.
        }

        navigation.navigate("PlaceDetail", { place });
    }

    async function handleSave(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.SAVE,
                metadata: {
                    source: "home_feed",
                    place,
                },
            });
            Alert.alert("Saved", "Place added to your saved list.");
        } catch (err) {
            Alert.alert("Unable to save", getApiErrorMessage(err));
        }
    }

    async function handleDismiss(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.DISMISS,
                metadata: {
                    source: "home_feed",
                    place,
                },
            });
            setPlaces((current) =>
                current.filter((item) => item.placeId !== place.placeId),
            );
        } catch (err) {
            Alert.alert("Unable to dismiss", getApiErrorMessage(err));
        }
    }

    const data = useMemo(() => places, [places]);
    const greetingMeta = useMemo(() => getGreetingMeta(now, name), [now, name]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <TopGreetingBanner
                    eyebrow="Personalized picks"
                    title={greetingMeta.greeting}
                    subtitle={greetingMeta.headline}
                    onAction={handleRefresh}
                />

                <View style={styles.filtersRow}>
                    <LinearGradient
                        colors={gradients.primaryButtonMint}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.filterChipActiveWrap}
                    >
                        <Text style={styles.filterChipActive}>For You</Text>
                    </LinearGradient>
                    <Text style={styles.filterChip}>Trending</Text>
                    <Text style={styles.filterChip}>Nearby</Text>
                </View>

                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {!loading && data.length === 0 ? (
                    <EmptyState
                        message="We're still learning your taste. Update your profile to improve recommendations."
                        ctaLabel="Update Profile"
                        onPress={() => navigation.navigate("Profile")}
                    />
                ) : (
                    <FlatList
                        data={data}
                        keyExtractor={(item) => item.id}
                        showsVerticalScrollIndicator={false}
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => (
                            <PlaceCard
                                place={item}
                                onPress={() => handleOpenDetail(item)}
                                onSave={() => handleSave(item)}
                                onDismiss={() => handleDismiss(item)}
                            />
                        )}
                    />
                )}
            </LinearGradient>
        </SafeAreaView>
    );
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
        errorText: {
            color: palette.danger,
            marginBottom: 10,
            fontSize: 12,
        },
        filtersRow: {
            flexDirection: "row",
            gap: 10,
            marginTop: 14,
            marginBottom: 12,
        },
        filterChipActiveWrap: {
            borderRadius: 999,
            overflow: "hidden",
        },
        filterChipActive: {
            color: palette.iceWhite,
            fontWeight: "800",
            fontSize: 11,
            textTransform: "uppercase",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
        },
        filterChip: {
            color: palette.textSecondary,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            fontSize: 11,
            textTransform: "uppercase",
            fontWeight: "700",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
        },
        listContent: {
            paddingBottom: 20,
        },
    });
}
