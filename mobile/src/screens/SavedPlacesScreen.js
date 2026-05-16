import { useCallback, useMemo, useRef } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import PlaceCard from "../components/PlaceCard";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import TopGreetingBanner from "../components/TopGreetingBanner";
import { useSavedPlaces } from "../hooks/useSavedPlaces";
import { useAppTheme } from "../context/ThemeContext";

export default function SavedPlacesScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const {
        loading,
        error,
        saved,
        refreshing,
        loadSaved,
        handleRefresh,
        handleDismiss,
    } = useSavedPlaces();

    const loadedOnce = useRef(false);

    useFocusEffect(
        useCallback(() => {
            loadSaved({ silent: loadedOnce.current });
            loadedOnce.current = true;
        }, [loadSaved]),
    );

    function openPlaceDetail(place) {
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

    async function onDismiss(place) {
        await handleDismiss(place, { source: "saved_places_screen" });
    }

    function browseHome() {
        navigation.navigate("MainTabs", { screen: "Home" });
    }

    const canGoBack = navigation.canGoBack();

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                {canGoBack ? (
                    <Pressable
                        style={styles.backRow}
                        onPress={() => navigation.goBack()}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Ionicons
                            name="chevron-back"
                            size={22}
                            color={palette.textPrimary}
                        />
                        <Text style={styles.backLabel}>Back</Text>
                    </Pressable>
                ) : null}

                <TopGreetingBanner
                    eyebrow="Your collection"
                    title="Saved Places"
                    subtitle="All your favorites in one place, ready whenever you are"
                    onAction={handleRefresh}
                    actionIcon="refresh-outline"
                />
                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {!loading && saved.length === 0 ? (
                    <EmptyState
                        message="No saved places yet. Start saving your favorites."
                        ctaLabel="Browse Home"
                        onPress={browseHome}
                    />
                ) : (
                    <FlatList
                        data={saved}
                        keyExtractor={(item) => item.id}
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => (
                            <PlaceCard
                                place={item}
                                onPress={() => openPlaceDetail(item)}
                                onDismiss={() => onDismiss(item)}
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
        backRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            marginTop: 4,
            marginBottom: 6,
            alignSelf: "flex-start",
            paddingVertical: 4,
            paddingRight: 12,
        },
        backLabel: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "700",
        },
        errorText: {
            color: palette.danger,
            marginTop: 8,
        },
        list: {
            marginTop: 14,
            paddingBottom: 24,
        },
    });
}
