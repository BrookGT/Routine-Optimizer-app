import {
    Dimensions,
    Image,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import MapView, { Marker } from "react-native-maps";
import { useAppTheme } from "../context/ThemeContext";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(isoDate) {
    if (!isoDate) return "Date TBA";
    try {
        const d = new Date(isoDate);
        return d.toLocaleDateString("en-ET", {
            weekday: "long",
            year:    "numeric",
            month:   "long",
            day:     "numeric",
        });
    } catch {
        return isoDate.slice(0, 10);
    }
}

function formatEventTime(isoDate) {
    if (!isoDate) return "";
    try {
        const d = new Date(isoDate);
        const h = d.getHours();
        const m = d.getMinutes();
        if (h === 0 && m === 0) return "";
        return d.toLocaleTimeString("en-ET", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

const CATEGORY_COLORS = {
    music:     "#E040FB",
    tech:      "#2196F3",
    church:    "#FF7043",
    fitness:   "#4CAF50",
    business:  "#FF9800",
    food:      "#F44336",
    art:       "#9C27B0",
    sports:    "#00BCD4",
    education: "#3F51B5",
    social:    "#009688",
    other:     "#607D8B",
};

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, palette }) {
    return (
        <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: palette.pageMid }]}>
                <Ionicons name={icon} size={18} color={palette.oceanBlue} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: palette.textMuted }]}>{label}</Text>
                <Text style={[styles.infoValue, { color: palette.textPrimary }]}>{value}</Text>
            </View>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EventDetailScreen({ route, navigation }) {
    const { event } = route.params ?? {};
    const { palette, gradients, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const dynStyles = useMemo(() => createDynStyles(palette, isDark), [palette, isDark]);

    if (!event) {
        return (
            <View style={[styles.center, { backgroundColor: palette.pageTop }]}>
                <Text style={{ color: palette.textPrimary }}>Event not found</Text>
            </View>
        );
    }

    const catColor = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.other;
    const dateStr = formatEventDate(event.date);
    const timeStr = formatEventTime(event.date);

    const lat = event.coordinates?.lat ?? 9.0320;
    const lng = event.coordinates?.lng ?? 38.7469;
    const hasCoords = lat !== 9.0320 || lng !== 38.7469;

    const openSource = () => {
        if (!event.source_url) return;
        Linking.openURL(event.source_url).catch(() => null);
    };

    return (
        <LinearGradient colors={gradients.appBackground} style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1 }} edges={["top"]}>

                {/* Back button */}
                <View style={[dynStyles.topBar, { paddingTop: 4 }]}>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        style={[dynStyles.backBtn]}
                        hitSlop={10}
                    >
                        <Ionicons name="arrow-back" size={22} color={palette.textPrimary} />
                    </Pressable>
                    <Text style={[dynStyles.topBarTitle, { color: palette.textPrimary }]} numberOfLines={1}>
                        Event Details
                    </Text>
                    <View style={{ width: 38 }} />
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
                >
                    {/* Hero image */}
                    {event.image ? (
                        <Image
                            source={{ uri: event.image }}
                            style={styles.heroImage}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={[styles.heroPlaceholder, { backgroundColor: palette.pageMid }]}>
                            <Ionicons name="calendar" size={64} color={palette.oceanBlue} />
                        </View>
                    )}

                    {/* Category badge overlay */}
                    <View style={[styles.catBadge, { backgroundColor: catColor }]}>
                        <Text style={styles.catBadgeText}>{(event.category || "other").toUpperCase()}</Text>
                    </View>

                    <View style={dynStyles.content}>
                        {/* Title */}
                        <Text style={[styles.title, { color: palette.textPrimary }]}>
                            {event.title}
                        </Text>

                        {/* Info rows */}
                        <View style={[dynStyles.infoCard]}>
                            <InfoRow
                                icon="calendar-outline"
                                label="Date"
                                value={timeStr ? `${dateStr} at ${timeStr}` : dateStr}
                                palette={palette}
                            />
                            <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
                            <InfoRow
                                icon="location-outline"
                                label="Location"
                                value={event.location || "Addis Ababa"}
                                palette={palette}
                            />
                            {event.source && (
                                <>
                                    <View style={[styles.divider, { backgroundColor: palette.borderSoft }]} />
                                    <InfoRow
                                        icon="globe-outline"
                                        label="Source"
                                        value={event.source.replace(/_/g, " ")}
                                        palette={palette}
                                    />
                                </>
                            )}
                        </View>

                        {/* Description */}
                        {event.description ? (
                            <View style={dynStyles.section}>
                                <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
                                    About this event
                                </Text>
                                <Text style={[styles.description, { color: palette.textPrimary }]}>
                                    {event.description}
                                </Text>
                            </View>
                        ) : null}

                        {/* Map */}
                        <View style={dynStyles.section}>
                            <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
                                Location
                            </Text>
                            <View style={styles.mapWrap}>
                                <MapView
                                    style={styles.map}
                                    initialRegion={{
                                        latitude:  lat,
                                        longitude: lng,
                                        latitudeDelta:  0.015,
                                        longitudeDelta: 0.015,
                                    }}
                                    scrollEnabled={false}
                                    zoomEnabled={false}
                                    rotateEnabled={false}
                                    pitchEnabled={false}
                                >
                                    <Marker
                                        coordinate={{ latitude: lat, longitude: lng }}
                                        title={event.title}
                                        description={event.location}
                                        pinColor={catColor}
                                    />
                                </MapView>
                            </View>
                            {!hasCoords && (
                                <Text style={[styles.mapNote, { color: palette.textMuted }]}>
                                    Showing approximate Addis Ababa location
                                </Text>
                            )}
                        </View>

                        {/* View Source CTA */}
                        {event.source_url ? (
                            <Pressable onPress={openSource} style={styles.ctaWrap}>
                                <LinearGradient
                                    colors={gradients.primaryButtonMint}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.cta}
                                >
                                    <Ionicons name="open-outline" size={18} color="#fff" />
                                    <Text style={styles.ctaText}>View Source</Text>
                                </LinearGradient>
                            </Pressable>
                        ) : null}
                    </View>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    heroImage: { width: "100%", height: 240 },
    heroPlaceholder: {
        width: "100%",
        height: 200,
        alignItems: "center",
        justifyContent: "center",
    },
    catBadge: {
        alignSelf: "flex-start",
        marginHorizontal: 18,
        marginTop: -14,
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 20,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    catBadgeText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.8,
    },
    title: {
        fontSize: 22,
        fontWeight: "800",
        lineHeight: 28,
        marginTop: 14,
        marginBottom: 18,
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    infoIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    infoLabel: {
        fontSize: 11,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: "600",
        lineHeight: 19,
    },
    divider: {
        height: 1,
        marginHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    description: {
        fontSize: 15,
        lineHeight: 23,
    },
    mapWrap: {
        borderRadius: 16,
        overflow: "hidden",
        height: 200,
    },
    map: {
        flex: 1,
    },
    mapNote: {
        fontSize: 11,
        marginTop: 6,
        textAlign: "center",
        fontStyle: "italic",
    },
    ctaWrap: {
        borderRadius: 16,
        overflow: "hidden",
        height: 52,
        marginTop: 8,
    },
    cta: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    ctaText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "800",
        letterSpacing: 0.3,
    },
});

function createDynStyles(palette, isDark) {
    return StyleSheet.create({
        topBar: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 8,
            justifyContent: "space-between",
        },
        backBtn: {
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
        },
        topBarTitle: {
            fontSize: 17,
            fontWeight: "700",
            flex: 1,
            textAlign: "center",
            marginHorizontal: 8,
        },
        content: {
            paddingHorizontal: 18,
            paddingTop: 4,
        },
        infoCard: {
            borderRadius: 16,
            backgroundColor: isDark
                ? "rgba(18,35,58,0.8)"
                : "rgba(255,255,255,0.84)",
            borderWidth: 1,
            borderColor: palette.borderSoft,
            overflow: "hidden",
            marginBottom: 20,
        },
        section: {
            marginBottom: 22,
        },
    });
}
