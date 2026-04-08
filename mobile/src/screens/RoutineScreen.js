import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import TopGreetingBanner from "../components/TopGreetingBanner";
import { Ionicons } from "@expo/vector-icons";
import { createRoutine, deleteRoutine, getRoutines } from "../api/routineApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

const ROUTINE_SAMPLES = [
    {
        weekday: "tuesday",
        timeOfDay: "morning",
        activityType: "gym",
        locationPreference: "indoor",
        budgetRange: "medium",
    },
    {
        weekday: "thursday",
        timeOfDay: "evening",
        activityType: "coffee",
        locationPreference: "any",
        budgetRange: "low",
    },
    {
        weekday: "saturday",
        timeOfDay: "afternoon",
        activityType: "restaurant",
        locationPreference: "outdoor",
        budgetRange: "high",
    },
];

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function RoutineScreen() {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const [routines, setRoutines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const fetchRoutines = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const envelope = await getRoutines();
            const items = unwrapApiData(envelope, []);
            setRoutines(Array.isArray(items) ? items : []);
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load routines."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoutines();
    }, [fetchRoutines]);

    async function handleRefresh() {
        try {
            setRefreshing(true);
            await fetchRoutines();
        } finally {
            setRefreshing(false);
        }
    }

    const sample = useMemo(
        () => ROUTINE_SAMPLES[routines.length % ROUTINE_SAMPLES.length],
        [routines.length],
    );

    async function handleAddRoutine() {
        if (busy) {
            return;
        }

        try {
            setBusy(true);
            setError("");
            const envelope = await createRoutine(sample);
            const created = unwrapApiData(envelope, null);
            if (created) {
                setRoutines((current) => [created, ...current]);
            }
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

    const daysPlanned = `${Math.min(routines.length, 7)}/7`;
    const routineMatch = `${Math.min(96, 40 + routines.length * 12)}%`;

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <TopGreetingBanner
                    eyebrow="Weekly planner"
                    title="My Routines"
                    subtitle="Stay consistent with routines built around your week"
                    onAction={handleRefresh}
                />

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
                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {routines.length === 0 && !loading ? (
                    <EmptyState message="No routines yet. Add your first one." />
                ) : (
                    <FlatList
                        data={routines}
                        keyExtractor={(item) => item.id}
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => (
                            <View style={styles.card}>
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
                                            {formatLabel(item.budgetRange)}
                                        </Text>
                                    </View>
                                </View>

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
                )}

                <Pressable style={styles.fab} onPress={handleAddRoutine}>
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
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: palette.pageTop },
        screen: { flex: 1, paddingHorizontal: 16 },
        statsRow: {
            marginTop: 14,
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
        listContent: {
            paddingTop: 16,
            paddingBottom: 90,
            gap: 12,
        },
        card: {
            borderRadius: 18,
            padding: 14,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.borderStrong,
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
            position: "absolute",
            right: 10,
            top: 10,
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
            bottom: 22,
            width: 52,
            height: 52,
            borderRadius: 26,
            overflow: "hidden",
            backgroundColor: "transparent",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#269AE3",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
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
    });
}
