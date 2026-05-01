import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Animated,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { getRecommendedEvents, getEvents } from "../api/eventsApi";
import { getApiErrorMessage } from "../utils/api";

// ─── Category filter chips ────────────────────────────────────────────────────

const CATEGORIES = [
    { key: "all",       label: "All",       icon: "apps-outline" },
    { key: "music",     label: "Music",     icon: "musical-notes-outline" },
    { key: "tech",      label: "Tech",      icon: "laptop-outline" },
    { key: "business",  label: "Business",  icon: "briefcase-outline" },
    { key: "fitness",   label: "Fitness",   icon: "barbell-outline" },
    { key: "church",    label: "Church",    icon: "heart-outline" },
    { key: "food",      label: "Food",      icon: "restaurant-outline" },
    { key: "art",       label: "Art",       icon: "color-palette-outline" },
    { key: "social",    label: "Social",    icon: "people-outline" },
    { key: "education", label: "Education", icon: "book-outline" },
];

// ─── Date formatter ───────────────────────────────────────────────────────────

function formatEventDate(isoDate) {
    if (!isoDate) return "";
    try {
        const d = new Date(isoDate);
        return d.toLocaleDateString("en-ET", {
            weekday: "short",
            month:   "short",
            day:     "numeric",
            year:    "numeric",
        });
    } catch {
        return isoDate.slice(0, 10);
    }
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, onPress, palette, isDark }) {
    const cardBg = isDark
        ? "rgba(14, 28, 50, 0.92)"
        : "rgba(255, 255, 255, 0.88)";

    return (
        <Pressable
            onPress={() => onPress(event)}
            style={({ pressed }) => [
                styles.card,
                {
                    backgroundColor: cardBg,
                    borderColor: palette.borderSoft,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                },
            ]}
        >
            {/* Image */}
            {event.image ? (
                <Image
                    source={{ uri: event.image }}
                    style={styles.cardImage}
                    resizeMode="cover"
                />
            ) : (
                <View style={[styles.cardImagePlaceholder, { backgroundColor: palette.pageMid }]}>
                    <Ionicons name="calendar-outline" size={36} color={palette.oceanBlue} />
                </View>
            )}

            {/* Category badge */}
            <View style={[styles.categoryBadge, { backgroundColor: palette.oceanBlue }]}>
                <Text style={styles.categoryBadgeText}>
                    {(event.category || "other").toUpperCase()}
                </Text>
            </View>

            {/* Details */}
            <View style={styles.cardBody}>
                <Text
                    style={[styles.cardTitle, { color: palette.textPrimary }]}
                    numberOfLines={2}
                >
                    {event.title}
                </Text>

                <View style={styles.cardMeta}>
                    <Ionicons name="calendar-outline" size={13} color={palette.textMuted} />
                    <Text style={[styles.cardMetaText, { color: palette.textMuted }]}>
                        {" "}{formatEventDate(event.date)}
                    </Text>
                </View>

                <View style={[styles.cardMeta, { marginTop: 4 }]}>
                    <Ionicons name="location-outline" size={13} color={palette.textMuted} />
                    <Text
                        style={[styles.cardMetaText, { color: palette.textMuted }]}
                        numberOfLines={1}
                    >
                        {" "}{event.location || "Addis Ababa"}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EventsScreen({ navigation }) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles2 = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [activeCategory, setActiveCategory] = useState("all");

    const fadeAnim = useRef(new Animated.Value(0)).current;

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchEvents = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        setError(null);

        try {
            // Personalised first; fall back to general list
            let result;
            try {
                result = await getRecommendedEvents();
            } catch {
                result = await getEvents({ limit: 50 });
            }

            const list = result?.events || [];
            setEvents(list);

            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 350,
                useNativeDriver: true,
            }).start();
        } catch (err) {
            setError(getApiErrorMessage(err));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fadeAnim]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchEvents(true);
    }, [fetchEvents]);

    // ── Filtered events ────────────────────────────────────────────────────────

    const displayed = useMemo(() => {
        if (activeCategory === "all") return events;
        return events.filter((e) => e.category === activeCategory);
    }, [events, activeCategory]);

    // ── Handlers ───────────────────────────────────────────────────────────────

    const handleCardPress = useCallback((event) => {
        navigation.navigate("EventDetail", { event });
    }, [navigation]);

    const canGoBack = navigation.canGoBack();

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <LinearGradient
            colors={gradients.appBackground}
            style={{ flex: 1 }}
        >
            <SafeAreaView style={{ flex: 1 }} edges={["top"]}>

                {/* Header */}
                <View style={styles2.header}>
                    <View style={styles2.headerTopRow}>
                        {canGoBack ? (
                            <Pressable
                                onPress={() => navigation.goBack()}
                                hitSlop={12}
                                style={styles2.headerBackBtn}
                                accessibilityRole="button"
                                accessibilityLabel="Go back"
                            >
                                <Ionicons
                                    name="arrow-back"
                                    size={22}
                                    color={palette.textPrimary}
                                />
                            </Pressable>
                        ) : null}
                        <View style={styles2.headerTextCol}>
                            <Text
                                style={[
                                    styles2.headerTitle,
                                    { color: palette.textPrimary },
                                ]}
                            >
                                Events in Addis
                            </Text>
                            <Text
                                style={[
                                    styles2.headerSub,
                                    { color: palette.textMuted },
                                ]}
                            >
                                Real Ethiopian events, updated daily
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Category chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles2.chipsRow}
                    style={styles2.chipsScroll}
                >
                    {CATEGORIES.map((cat) => {
                        const active = activeCategory === cat.key;
                        return (
                            <Pressable
                                key={cat.key}
                                onPress={() => setActiveCategory(cat.key)}
                                style={[
                                    styles2.chip,
                                    {
                                        backgroundColor: active
                                            ? palette.oceanBlue
                                            : palette.surface,
                                        borderColor: active
                                            ? palette.oceanBlue
                                            : palette.borderSoft,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={cat.icon}
                                    size={14}
                                    color={active ? "#fff" : palette.textSecondary}
                                />
                                <Text
                                    style={[
                                        styles2.chipText,
                                        {
                                            color: active ? "#fff" : palette.textSecondary,
                                        },
                                    ]}
                                >
                                    {cat.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {/* Content */}
                {loading && !refreshing ? (
                    <View style={styles2.centerContainer}>
                        <ActivityIndicator size="large" color={palette.oceanBlue} />
                        <Text style={[styles2.loadingText, { color: palette.textMuted }]}>
                            Loading events…
                        </Text>
                    </View>
                ) : error ? (
                    <View style={styles2.centerContainer}>
                        <Ionicons name="cloud-offline-outline" size={48} color={palette.textMuted} />
                        <Text style={[styles2.errorTitle, { color: palette.textPrimary }]}>
                            Could not load events
                        </Text>
                        <Text style={[styles2.errorSub, { color: palette.textMuted }]}>
                            {error}
                        </Text>
                        <Pressable onPress={() => fetchEvents()} style={styles2.retryBtn}>
                            <LinearGradient
                                colors={gradients.primaryButtonMint}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles2.retryBtnGrad}
                            >
                                <Text style={styles2.retryBtnText}>Retry</Text>
                            </LinearGradient>
                        </Pressable>
                    </View>
                ) : (
                    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                        <FlatList
                            data={displayed}
                            keyExtractor={(item) => item.id || item.title}
                            renderItem={({ item }) => (
                                <EventCard
                                    event={item}
                                    onPress={handleCardPress}
                                    palette={palette}
                                    isDark={isDark}
                                />
                            )}
                            contentContainerStyle={styles2.list}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    tintColor={palette.oceanBlue}
                                />
                            }
                            ListEmptyComponent={
                                <View style={styles2.centerContainer}>
                                    <Ionicons
                                        name="calendar-outline"
                                        size={52}
                                        color={palette.textMuted}
                                    />
                                    <Text style={[styles2.emptyTitle, { color: palette.textPrimary }]}>
                                        No events found
                                    </Text>
                                    <Text style={[styles2.emptySub, { color: palette.textMuted }]}>
                                        {activeCategory !== "all"
                                            ? `No ${activeCategory} events available right now`
                                            : "Events will appear here once scraped"}
                                    </Text>
                                </View>
                            }
                        />
                    </Animated.View>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: "hidden",
        marginBottom: 14,
    },
    cardImage: {
        width: "100%",
        height: 170,
    },
    cardImagePlaceholder: {
        width: "100%",
        height: 170,
        alignItems: "center",
        justifyContent: "center",
    },
    categoryBadge: {
        position: "absolute",
        top: 12,
        left: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    categoryBadgeText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    cardBody: {
        padding: 14,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: "700",
        lineHeight: 20,
        marginBottom: 8,
    },
    cardMeta: {
        flexDirection: "row",
        alignItems: "center",
    },
    cardMetaText: {
        fontSize: 12,
        flex: 1,
    },
});

function createStyles(palette, isDark) {
    return StyleSheet.create({
        header: {
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 10,
        },
        headerTopRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 6,
        },
        headerBackBtn: {
            marginTop: 4,
            paddingVertical: 2,
            paddingRight: 4,
        },
        headerTextCol: {
            flex: 1,
            minWidth: 0,
        },
        headerTitle: {
            fontSize: 26,
            fontWeight: "800",
        },
        headerSub: {
            fontSize: 13,
            marginTop: 2,
        },
        chipsScroll: {
            maxHeight: 46,
            marginBottom: 8,
        },
        chipsRow: {
            paddingHorizontal: 16,
            gap: 8,
            alignItems: "center",
        },
        chip: {
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 20,
            borderWidth: 1,
        },
        chipText: {
            fontSize: 12,
            fontWeight: "600",
        },
        list: {
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 110,
        },
        centerContainer: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
            gap: 10,
            marginTop: 40,
        },
        loadingText: {
            fontSize: 14,
            marginTop: 8,
        },
        errorTitle: {
            fontSize: 18,
            fontWeight: "700",
            textAlign: "center",
        },
        errorSub: {
            fontSize: 13,
            textAlign: "center",
            lineHeight: 18,
        },
        retryBtn: {
            marginTop: 12,
            borderRadius: 12,
            overflow: "hidden",
            height: 44,
            width: 140,
        },
        retryBtnGrad: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
        },
        retryBtnText: {
            color: "#fff",
            fontWeight: "700",
            fontSize: 14,
        },
        emptyTitle: {
            fontSize: 18,
            fontWeight: "700",
            textAlign: "center",
            marginTop: 8,
        },
        emptySub: {
            fontSize: 13,
            textAlign: "center",
            lineHeight: 18,
        },
    });
}
