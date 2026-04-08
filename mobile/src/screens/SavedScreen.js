import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import PlaceCard from "../components/PlaceCard";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import TopGreetingBanner from "../components/TopGreetingBanner";
import { createInteraction, getInteractions } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

function asSavedPlace(interaction, index) {
    const place = interaction?.metadata?.place;
    const placeId = interaction?.placeId ?? place?.placeId ?? `${index}`;

    return {
        id: placeId,
        placeId,
        name: place?.name ?? "Saved place",
        type: place?.type ?? "Place",
        score: place?.score ?? "Saved",
        distance: place?.distance ?? "Nearby",
        description:
            place?.description ?? "Saved from your recommendation history.",
        ...place,
    };
}

export default function SavedScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadSaved = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const envelope = await getInteractions();
            const interactions = unwrapApiData(envelope, []);
            const ordered = Array.isArray(interactions) ? interactions : [];
            const savedByPlace = new Map();

            ordered.forEach((interaction, index) => {
                const placeId = interaction?.placeId;
                if (!placeId) {
                    return;
                }

                if (interaction?.actionType === INTERACTION_TYPES.SAVE) {
                    savedByPlace.set(placeId, asSavedPlace(interaction, index));
                }

                if (interaction?.actionType === INTERACTION_TYPES.DISMISS) {
                    savedByPlace.delete(placeId);
                }
            });

            setSaved(Array.from(savedByPlace.values()));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load saved places."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSaved();
    }, [loadSaved]);

    async function handleRefresh() {
        try {
            setRefreshing(true);
            await loadSaved();
        } finally {
            setRefreshing(false);
        }
    }

    async function handleDismiss(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.DISMISS,
                metadata: {
                    source: "saved_screen",
                    place,
                },
            });
            setSaved((current) =>
                current.filter((item) => item.placeId !== place.placeId),
            );
        } catch (err) {
            Alert.alert("Unable to remove", getApiErrorMessage(err));
        }
    }

    const items = useMemo(() => saved, [saved]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <TopGreetingBanner
                    eyebrow="Your collection"
                    title="Saved Places"
                    subtitle="All your favorites in one place, ready whenever you are"
                    onAction={handleRefresh}
                />
                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {!loading && items.length === 0 ? (
                    <EmptyState
                        message="No saved places yet. Start saving your favorites."
                        ctaLabel="Browse Home"
                        onPress={() => navigation.navigate("Home")}
                    />
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={(item) => item.id}
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => (
                            <PlaceCard
                                place={item}
                                onPress={() =>
                                    navigation.navigate("PlaceDetail", {
                                        place: item,
                                    })
                                }
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
        safeArea: { flex: 1, backgroundColor: palette.pageTop },
        screen: { flex: 1, paddingHorizontal: 16 },
        errorText: {
            color: palette.danger,
            marginTop: 8,
        },
        list: {
            marginTop: 14,
            paddingBottom: 16,
        },
    });
}
