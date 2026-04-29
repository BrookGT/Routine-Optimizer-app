import {
    Alert,
    Animated,
    Dimensions,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView, { Marker } from "react-native-maps";
import { createInteraction } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage } from "../utils/api";
import { enrichPlaceLocation } from "../utils/placeLocation";
import { useAppTheme } from "../context/ThemeContext";
import { getPlaceDetails } from "../api/placeApi";
import { hasEmbeddedGoogleMapsSdkKey } from "../utils/mapsConfig";
import AuthenticatedPlacePhoto from "../components/AuthenticatedPlacePhoto";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashString(s) {
    const str = String(s ?? "");
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}

function openMapsExternal(lat, lng, label) {
    const q = encodeURIComponent(`${lat},${lng} (${label})`);
    Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${q}`,
    ).catch(() => null);
}

// ─── Mock data generators (deterministic by place id) ─────────────────────────

const AMENITY_SETS = {
    gym: ["Free WiFi", "Parking", "Air Conditioned", "Lockers", "Showers"],
    cafe: ["Free WiFi", "Outdoor Seating", "Power Outlets", "Takeaway"],
    church: ["Parking", "Wheelchair Access", "Children's Area", "Prayer Hall"],
    events: ["Sound System", "Stage", "Bar", "VIP Area", "Parking"],
    workspace: ["Free WiFi", "Standing Desks", "Meeting Rooms", "Coffee Bar", "Printing"],
    default: ["Free WiFi", "Parking", "Air Conditioned"],
};

const MOCK_REVIEWS = [
    {
        id: "r1",
        name: "Sarah M.",
        rating: 5,
        comment: "Amazing place! Great atmosphere and friendly staff.",
        timeAgo: "2 days ago",
    },
    {
        id: "r2",
        name: "John D.",
        rating: 4,
        comment: "Good value for money. Would recommend.",
        timeAgo: "1 week ago",
    },
    {
        id: "r3",
        name: "Emma W.",
        rating: 5,
        comment: "Absolutely love this spot. Will definitely come back!",
        timeAgo: "2 weeks ago",
    },
    {
        id: "r4",
        name: "Mike A.",
        rating: 3,
        comment: "Decent place, a bit crowded on weekends.",
        timeAgo: "3 weeks ago",
    },
];

function getAmenities(type = "") {
    const t = type.toLowerCase();
    if (t.includes("gym") || t.includes("fitness")) return AMENITY_SETS.gym;
    if (t.includes("cafe") || t.includes("coffee")) return AMENITY_SETS.cafe;
    if (t.includes("church") || t.includes("worship")) return AMENITY_SETS.church;
    if (t.includes("event") || t.includes("music")) return AMENITY_SETS.events;
    if (t.includes("workspace") || t.includes("office")) return AMENITY_SETS.workspace;
    return AMENITY_SETS.default;
}

function getSlideGradients(type = "", isDark) {
    const t = type.toLowerCase();
    if (t.includes("gym") || t.includes("fitness")) {
        return isDark
            ? [["#0b2540", "#0e3050"], ["#0a2035", "#0c2a45"], ["#0c2840", "#0f3055"]]
            : [["#b8d9f5", "#c5eae0"], ["#a8cef0", "#b8e6d8"], ["#c0d8f8", "#cceee6"]];
    }
    if (t.includes("cafe") || t.includes("coffee")) {
        return isDark
            ? [["#2a150a", "#301a0c"], ["#251008", "#2d1709"], ["#2e1810", "#341e12"]]
            : [["#ffe0c0", "#fff3e0"], ["#ffd8b0", "#ffedcc"], ["#ffe8c8", "#fff5e6"]];
    }
    if (t.includes("church")) {
        return isDark
            ? [["#161428", "#1c1836"], ["#14122a", "#1a1632"], ["#181630", "#1e1a38"]]
            : [["#e8e0ff", "#f0eaff"], ["#ddd5ff", "#e8e2ff"], ["#ece6ff", "#f4f0ff"]];
    }
    if (t.includes("event") || t.includes("music")) {
        return isDark
            ? [["#20102a", "#2a1436"], ["#1c0e26", "#241230"], ["#221228", "#2c1634"]]
            : [["#ffd8f0", "#f5d0ff"], ["#ffcce8", "#eec8ff"], ["#ffe0f5", "#f8d8ff"]];
    }
    return isDark
        ? [["#0c1f38", "#0e2845"], ["#0a1c35", "#0c2440"], ["#0e2040", "#102848"]]
        : [["#c8eeff", "#d5f5e8"], ["#beebff", "#caf2e4"], ["#cef0ff", "#d8f8ee"]];
}

function getTypeIcon(type = "") {
    const t = type.toLowerCase();
    if (t.includes("gym") || t.includes("fitness")) return "barbell";
    if (t.includes("cafe") || t.includes("coffee")) return "cafe";
    if (t.includes("church") || t.includes("worship")) return "business";
    if (t.includes("event") || t.includes("music")) return "musical-notes";
    if (t.includes("workspace") || t.includes("office")) return "briefcase";
    return "location";
}

function getPriceLabel(place) {
    const h = hashString(place?.placeId ?? place?.id ?? "x");
    const base = h % 3 === 0 ? 150 : h % 3 === 1 ? 300 : 500;
    return `${base} ETB`;
}

function getCtaLabel(type = "") {
    const t = type.toLowerCase();
    if (t.includes("gym") || t.includes("fitness")) return "Book Membership";
    if (t.includes("cafe") || t.includes("coffee")) return "Get Directions";
    if (t.includes("church")) return "Visit Now";
    if (t.includes("event")) return "Get Ticket";
    if (t.includes("workspace")) return "Book a Desk";
    return "Save Place";
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function Stars({ rating, size = 14 }) {
    return (
        <View style={{ flexDirection: "row", gap: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons
                    key={i}
                    name={i <= rating ? "star" : "star-outline"}
                    size={size}
                    color="#F5A623"
                />
            ))}
        </View>
    );
}

// ─── Image Carousel ───────────────────────────────────────────────────────────

function GradientSlide({ colors, typeIcon, isDark, idx, total }) {
    return (
        <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[carouselStyles.slide, { width: SCREEN_W }]}
        >
            <View style={carouselStyles.grid} pointerEvents="none">
                {[60, 130, 200].map((x) => (
                    <View
                        key={`gx-${x}`}
                        style={[carouselStyles.gridLine, { left: x, top: 0, bottom: 0, width: 1 }]}
                    />
                ))}
                {[60, 130, 200].map((y) => (
                    <View
                        key={`gy-${y}`}
                        style={[carouselStyles.gridLine, { top: y, left: 0, right: 0, height: 1 }]}
                    />
                ))}
            </View>
            <View style={carouselStyles.iconWrap}>
                <Ionicons
                    name={typeIcon}
                    size={52}
                    color={isDark ? "rgba(140,210,255,0.5)" : "rgba(30,110,190,0.35)"}
                />
            </View>
            <View style={carouselStyles.slideLabel}>
                <Text style={{ color: isDark ? "rgba(200,235,255,0.6)" : "rgba(20,80,140,0.5)", fontSize: 10, fontWeight: "700" }}>
                    {idx + 1} / {total}
                </Text>
            </View>
        </LinearGradient>
    );
}

function CarouselPhotoSlide({
    imagePath,
    idx,
    slideCount,
    isDark,
    slideGradients,
    typeIcon,
}) {
    const [failed, setFailed] = useState(false);
    const colors = slideGradients[idx % slideGradients.length] ?? slideGradients[0];

    if (!imagePath || failed) {
        return (
            <GradientSlide
                colors={colors}
                typeIcon={typeIcon}
                isDark={isDark}
                idx={idx}
                total={slideCount}
            />
        );
    }

    return (
        <View style={[carouselStyles.slide, { width: SCREEN_W }]}>
            <AuthenticatedPlacePhoto
                imagePath={imagePath}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
                onError={() => setFailed(true)}
            />
            <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.35)"]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 0, y: 1 }}
                pointerEvents="none"
            />
            <View style={carouselStyles.slideLabel}>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "700" }}>
                    {idx + 1} / {slideCount}
                </Text>
            </View>
        </View>
    );
}

function ImageCarousel({ place, details, palette, isDark, onBack, onSave, isSaved }) {
    const scrollRef = useRef(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const slideGradients = useMemo(
        () => getSlideGradients(place?.type ?? "", isDark),
        [place?.type, isDark],
    );
    const typeIcon = getTypeIcon(place?.type ?? "");

    // Authenticated API paths `/places/:id/photo?ref=...` (same as recommendation `images`)
    const photoPaths = useMemo(() => {
        if (Array.isArray(details?.images) && details.images.length) {
            return details.images.slice(0, 5);
        }
        if (Array.isArray(place?.images) && place.images.length) {
            return place.images.slice(0, 5);
        }
        const photos = details?.photos ?? [];
        const placeId = place?.placeId ?? place?.id ?? "";
        if (!placeId || !photos.length) return [];
        return photos.slice(0, 5).map(
            (p) =>
                `/places/${encodeURIComponent(placeId)}/photo?ref=${encodeURIComponent(p.reference)}&w=800`,
        );
    }, [details?.images, details?.photos, place?.images, place?.placeId, place?.id]);

    const hasPhotos = photoPaths.length > 0;
    const slideCount = hasPhotos ? photoPaths.length : slideGradients.length;

    const handleScroll = useCallback((e) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
        setActiveIndex(idx);
    }, []);

    return (
        <View style={carouselStyles.container}>
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                scrollEventThrottle={16}
            >
                {hasPhotos
                    ? photoPaths.map((path, idx) => (
                        <CarouselPhotoSlide
                            key={`${path}-${idx}`}
                            imagePath={path}
                            idx={idx}
                            slideCount={slideCount}
                            isDark={isDark}
                            slideGradients={slideGradients}
                            typeIcon={typeIcon}
                        />
                    ))
                    : null}
                {hasPhotos
                    ? null
                    : slideGradients.map((colors, idx) => (
                        <GradientSlide
                            key={idx}
                            colors={colors}
                            typeIcon={typeIcon}
                            isDark={isDark}
                            idx={idx}
                            total={slideCount}
                        />
                    ))}
            </ScrollView>

            {/* Dots */}
            <View style={carouselStyles.dots}>
                {Array.from({ length: slideCount }).map((_, i) => (
                    <View
                        key={i}
                        style={[
                            carouselStyles.dot,
                            i === activeIndex && carouselStyles.dotActive,
                        ]}
                    />
                ))}
            </View>

            {/* Back button */}
            <Pressable onPress={onBack} hitSlop={12} style={carouselStyles.backBtn}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>

            {/* Save/heart button */}
            <Pressable
                onPress={onSave}
                hitSlop={12}
                style={[
                    carouselStyles.heartBtn,
                    isSaved && { backgroundColor: "rgba(207,62,85,0.85)" },
                ]}
            >
                <Ionicons
                    name={isSaved ? "heart" : "heart-outline"}
                    size={19}
                    color="#fff"
                />
            </Pressable>
        </View>
    );
}

const carouselStyles = StyleSheet.create({
    container: { height: 260, width: "100%", position: "relative" },
    slide: {
        height: 260,
        alignItems: "center",
        justifyContent: "center",
    },
    grid: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.14,
    },
    gridLine: {
        position: "absolute",
        backgroundColor: "#38AEFF",
    },
    iconWrap: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: "rgba(255,255,255,0.08)",
        alignItems: "center",
        justifyContent: "center",
    },
    slideLabel: {
        position: "absolute",
        top: 12,
        right: 12,
    },
    dots: {
        position: "absolute",
        bottom: 14,
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "center",
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.4)",
    },
    dotActive: {
        width: 18,
        backgroundColor: "rgba(255,255,255,0.92)",
    },
    backBtn: {
        position: "absolute",
        top: 16,
        left: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(10,30,55,0.48)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
    },
    heartBtn: {
        position: "absolute",
        top: 16,
        right: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(10,30,55,0.48)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
    },
});

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Reviews", "Map"];

function TabBar({ active, onChange, palette, isDark }) {
    return (
        <View
            style={[
                tabStyles.wrap,
                {
                    backgroundColor: isDark
                        ? "rgba(18,35,60,0.9)"
                        : "rgba(235,245,255,0.9)",
                    borderColor: isDark
                        ? "rgba(100,180,255,0.18)"
                        : "rgba(10,106,168,0.12)",
                },
            ]}
        >
            {TABS.map((tab) => {
                const isActive = active === tab;
                return (
                    <Pressable
                        key={tab}
                        onPress={() => onChange(tab)}
                        style={[
                            tabStyles.tab,
                            isActive && {
                                backgroundColor: isDark ? "rgba(22,44,72,0.95)" : "#fff",
                                borderColor: isDark
                                    ? "rgba(100,180,255,0.3)"
                                    : "rgba(10,106,168,0.2)",
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.08,
                                shadowRadius: 6,
                                elevation: 3,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                tabStyles.tabText,
                                {
                                    color: isActive
                                        ? palette.textPrimary
                                        : palette.textMuted,
                                    fontWeight: isActive ? "800" : "600",
                                },
                            ]}
                        >
                            {tab}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const tabStyles = StyleSheet.create({
    wrap: {
        flexDirection: "row",
        borderRadius: 16,
        borderWidth: 1,
        padding: 4,
        gap: 2,
    },
    tab: {
        flex: 1,
        paddingVertical: 9,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "transparent",
    },
    tabText: {
        fontSize: 13,
    },
});

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ place, details, palette, isDark, styles }) {
    // Prefer Google details; fall back to local place object or static defaults
    const tags = details?.tags?.length
        ? details.tags
        : (place?.tags?.length ? place.tags : getAmenities(place?.type ?? ""));

    const phone   = details?.phone   ?? null;
    const website = details?.website ?? null;
    const address = details?.address ?? place?.addressLine ?? "Addis Ababa, Ethiopia";
    const weekdayHours = details?.openingHours?.weekdayText ?? [];
    const hoursDisplay = weekdayHours.length
        ? weekdayHours[0]
        : (place?.hoursDisplay ?? "Mon–Sun · 9:00 — 22:00");

    return (
        <View style={styles.tabContent}>
            {/* About */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.bodyText}>
                    {place?.description ??
                        `A premium facility offering top-notch services and amenities. Perfect for your daily routine and lifestyle needs.`}
                </Text>
            </View>

            {/* Tags / Amenities */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                    {details ? "Tags" : "Amenities"}
                </Text>
                <View style={styles.chipRow}>
                    {tags.map((a) => (
                        <View
                            key={a}
                            style={[
                                styles.chip,
                                {
                                    backgroundColor: isDark
                                        ? "rgba(20,45,75,0.8)"
                                        : "rgba(255,255,255,0.9)",
                                    borderColor: isDark
                                        ? "rgba(100,180,255,0.22)"
                                        : "rgba(10,106,168,0.16)",
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.chipText,
                                    { color: palette.textSecondary },
                                ]}
                            >
                                {a.replace(/_/g, " ")}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Contact */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contact</Text>

                {phone ? (
                    <Pressable
                        style={styles.contactRow}
                        onPress={() =>
                            Linking.openURL(`tel:${phone}`).catch(() => null)
                        }
                    >
                        <View
                            style={[
                                styles.contactIconBox,
                                { backgroundColor: isDark ? "rgba(20,55,95,0.8)" : "rgba(220,242,255,0.9)" },
                            ]}
                        >
                            <Ionicons
                                name="call-outline"
                                size={16}
                                color={palette.oceanBlue}
                            />
                        </View>
                        <Text style={[styles.contactText, { color: palette.textPrimary }]}>
                            {phone}
                        </Text>
                        <Ionicons
                            name="chevron-forward"
                            size={14}
                            color={palette.textMuted}
                        />
                    </Pressable>
                ) : null}

                {website ? (
                    <Pressable
                        style={[styles.contactRow, { marginTop: phone ? 8 : 0 }]}
                        onPress={() => Linking.openURL(website).catch(() => null)}
                    >
                        <View
                            style={[
                                styles.contactIconBox,
                                { backgroundColor: isDark ? "rgba(20,55,95,0.8)" : "rgba(220,242,255,0.9)" },
                            ]}
                        >
                            <Ionicons
                                name="globe-outline"
                                size={16}
                                color={palette.oceanBlue}
                            />
                        </View>
                        <Text
                            style={[styles.contactText, { color: palette.oceanBlue, flex: 1 }]}
                            numberOfLines={1}
                        >
                            {website.replace(/^https?:\/\//, "")}
                        </Text>
                        <Ionicons
                            name="chevron-forward"
                            size={14}
                            color={palette.textMuted}
                        />
                    </Pressable>
                ) : null}

                <View style={[styles.contactRow, { marginTop: 8 }]}>
                    <View
                        style={[
                            styles.contactIconBox,
                            { backgroundColor: isDark ? "rgba(20,55,95,0.8)" : "rgba(220,242,255,0.9)" },
                        ]}
                    >
                        <Ionicons
                            name="time-outline"
                            size={16}
                            color={palette.oceanBlue}
                        />
                    </View>
                    <Text style={[styles.contactText, { color: palette.textSecondary }]}>
                        {hoursDisplay}
                    </Text>
                </View>

                <View style={[styles.contactRow, { marginTop: 8 }]}>
                    <View
                        style={[
                            styles.contactIconBox,
                            { backgroundColor: isDark ? "rgba(20,55,95,0.8)" : "rgba(220,242,255,0.9)" },
                        ]}
                    >
                        <Ionicons
                            name="location-outline"
                            size={16}
                            color={palette.oceanBlue}
                        />
                    </View>
                    <Text
                        style={[
                            styles.contactText,
                            { color: palette.textSecondary, flex: 1 },
                        ]}
                        numberOfLines={2}
                    >
                        {address}
                    </Text>
                </View>
            </View>
        </View>
    );
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────────

function ReviewsTab({ place, details, palette, isDark, styles }) {
    // Use real Google reviews when available; fall back to static mock
    const h = hashString(place?.placeId ?? "x");
    const reviews = useMemo(() => {
        if (details?.reviews?.length) {
            return details.reviews.map((r, i) => ({
                id:      `gr-${i}`,
                name:    r.author,
                avatar:  r.avatar,
                rating:  r.rating,
                comment: r.text,
                timeAgo: r.timeAgo,
            }));
        }
        // Static fallback with hash-shifted ratings
        return MOCK_REVIEWS.map((r, i) => ({
            ...r,
            rating: Math.max(
                1,
                Math.min(5, r.rating + (((h >> (i * 3)) & 1) === 0 ? 0 : -1)),
            ),
        }));
    }, [details, h]);

    const totalCount = details?.userRatingsTotal ?? reviews.length;
    const avgRating  = details?.rating != null
        ? details.rating.toFixed(1)
        : (reviews.reduce((s, r) => s + r.rating, 0) / (reviews.length || 1)).toFixed(1);

    return (
        <View style={styles.tabContent}>
            {/* Summary */}
            <View
                style={[
                    styles.reviewSummary,
                    {
                        backgroundColor: isDark
                            ? "rgba(18,40,70,0.8)"
                            : "rgba(255,255,255,0.9)",
                        borderColor: isDark
                            ? "rgba(100,180,255,0.18)"
                            : "rgba(10,106,168,0.12)",
                    },
                ]}
            >
                <View style={styles.ratingBig}>
                    <Text style={[styles.ratingBigNum, { color: palette.textPrimary }]}>
                        {avgRating}
                    </Text>
                    <Stars rating={Math.round(Number(avgRating))} size={16} />
                    <Text style={[styles.ratingCount, { color: palette.textMuted }]}>
                        {totalCount.toLocaleString()} review{totalCount !== 1 ? "s" : ""}
                    </Text>
                </View>
            </View>

            {reviews.map((review) => (
                <View
                    key={review.id}
                    style={[
                        styles.reviewCard,
                        {
                            backgroundColor: isDark
                                ? "rgba(16,35,60,0.8)"
                                : "rgba(255,255,255,0.92)",
                            borderColor: isDark
                                ? "rgba(80,160,255,0.16)"
                                : "rgba(10,106,168,0.1)",
                        },
                    ]}
                >
                    <View style={styles.reviewHeader}>
                        <View style={styles.reviewAvatar}>
                            <Text style={styles.reviewAvatarText}>
                                {(review.name ?? "?").charAt(0)}
                            </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={styles.reviewNameRow}>
                                <Text
                                    style={[
                                        styles.reviewName,
                                        { color: palette.textPrimary },
                                    ]}
                                >
                                    {review.name}
                                </Text>
                                <Text
                                    style={[
                                        styles.reviewTime,
                                        { color: palette.textMuted },
                                    ]}
                                >
                                    {review.timeAgo}
                                </Text>
                            </View>
                            <Stars rating={review.rating} size={13} />
                        </View>
                    </View>
                    <Text
                        style={[styles.reviewComment, { color: palette.textSecondary }]}
                    >
                        {review.comment}
                    </Text>
                </View>
            ))}
        </View>
    );
}

// ─── Map Tab ──────────────────────────────────────────────────────────────────

function MapTab({ place, details, palette, isDark, styles }) {
    const lat = details?.location?.lat ?? place?.latitude;
    const lng = details?.location?.lng ?? place?.longitude;
    const hasCoords = typeof lat === "number" && typeof lng === "number";

    if (!hasCoords) {
        return (
            <View style={styles.tabContent}>
                <View
                    style={[
                        styles.mapNoCoords,
                        {
                            backgroundColor: isDark
                                ? "rgba(18,35,58,0.8)"
                                : "rgba(235,250,255,0.9)",
                            borderColor: palette.borderSoft,
                        },
                    ]}
                >
                    <Ionicons
                        name="location-outline"
                        size={36}
                        color={palette.textMuted}
                    />
                    <Text
                        style={[
                            styles.mapNoCoordsText,
                            { color: palette.textMuted },
                        ]}
                    >
                        Location not available
                    </Text>
                </View>
            </View>
        );
    }

    const region = {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
    };

    // Android/iOS require a native Maps SDK key baked in at build time; otherwise MapView crashes.
    const showNativeMap =
        Platform.OS !== "web" && hasEmbeddedGoogleMapsSdkKey();

    return (
        <View style={styles.tabContent}>
            {!showNativeMap ? (
                <Pressable
                    style={styles.mapShell}
                    onPress={() => openMapsExternal(lat, lng, place.name)}
                >
                    <LinearGradient
                        colors={
                            isDark
                                ? ["#0C2040", "#0e2d50", "#0B3428"]
                                : ["#C8EEFF", "#D8F5E8", "#E6F8F2"]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.mapFallback}
                    >
                        <Ionicons
                            name="location"
                            size={32}
                            color={palette.oceanBlue}
                        />
                        <Text
                            style={[
                                styles.mapFallbackTitle,
                                { color: palette.textPrimary },
                            ]}
                        >
                            Map Location
                        </Text>
                        <Text
                            style={[
                                styles.mapFallbackSub,
                                { color: palette.textSecondary },
                            ]}
                        >
                            {place?.distance ?? "Nearby"}
                        </Text>
                        <View style={styles.mapOpenRow}>
                            <Ionicons
                                name="open-outline"
                                size={13}
                                color={palette.oceanBlue}
                            />
                            <Text
                                style={[
                                    styles.mapOpenText,
                                    { color: palette.oceanBlue },
                                ]}
                            >
                                Open in Maps
                            </Text>
                        </View>
                    </LinearGradient>
                </Pressable>
            ) : (
                <Pressable
                    style={styles.mapShell}
                    onPress={() => openMapsExternal(lat, lng, place.name)}
                >
                    <MapView
                        style={StyleSheet.absoluteFillObject}
                        initialRegion={region}
                        scrollEnabled={false}
                        rotateEnabled={false}
                        pitchEnabled={false}
                        zoomEnabled={false}
                    >
                        <Marker
                            coordinate={{ latitude: lat, longitude: lng }}
                            title={place?.name}
                            description={place?.addressLine}
                        />
                    </MapView>
                    <View
                        style={[
                            styles.mapOpenHint,
                            { backgroundColor: isDark ? "rgba(12,28,50,0.9)" : "rgba(255,255,255,0.92)" },
                        ]}
                    >
                        <Ionicons
                            name="open-outline"
                            size={12}
                            color={palette.deepBlue}
                        />
                        <Text
                            style={[
                                styles.mapOpenHintText,
                                { color: palette.deepBlue },
                            ]}
                        >
                            Open in Maps
                        </Text>
                    </View>
                </Pressable>
            )}

            {/* Address */}
            <View
                style={[
                    styles.addressCard,
                    {
                        backgroundColor: isDark
                            ? "rgba(16,35,58,0.8)"
                            : "rgba(255,255,255,0.9)",
                        borderColor: palette.borderSoft,
                    },
                ]}
            >
                <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                    <Ionicons
                        name="location-outline"
                        size={18}
                        color={palette.oceanBlue}
                    />
                    <Text
                        style={[
                            styles.addressText,
                            { color: palette.textPrimary },
                        ]}
                    >
                        {place?.addressLine ?? "Addis Ababa, Ethiopia"}
                    </Text>
                </View>
                <Text
                    style={[styles.coordsText, { color: palette.textMuted }]}
                >
                    {`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
                </Text>
            </View>
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PlaceDetailScreen({ navigation, route }) {
    const { palette, gradients, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );

    const raw = route?.params?.place;
    const place = useMemo(() => enrichPlaceLocation(raw ?? {}, 0), [raw]);

    const [activeTab, setActiveTab] = useState("Overview");
    const [isSaved, setIsSaved] = useState(false);
    const saveAnim = useRef(new Animated.Value(1)).current;

    // Real place details fetched from Google Places via backend
    const [details, setDetails] = useState(null);

    useEffect(() => {
        const id = place?.placeId ?? place?.id;
        if (!id) return;
        getPlaceDetails(id)
            .then((envelope) => {
                if (envelope?.data) setDetails(envelope.data);
            })
            .catch(() => null); // silent — fall through to static data
    }, [place?.placeId, place?.id]);

    const bottomPad = Math.max(insets.bottom, 12) + 8;

    async function logAction(actionType, successMessage) {
        try {
            await createInteraction({
                placeId: place?.placeId ?? place?.id,
                actionType,
                metadata: { source: "place_detail", place },
            });
            if (successMessage) Alert.alert("Done", successMessage);
        } catch (error) {
            Alert.alert("Action failed", getApiErrorMessage(error));
        }
    }

    async function handleSave() {
        const newSaved = !isSaved;
        setIsSaved(newSaved);

        // Bounce animation
        Animated.sequence([
            Animated.spring(saveAnim, {
                toValue: 1.3,
                useNativeDriver: true,
                friction: 4,
            }),
            Animated.spring(saveAnim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 6,
            }),
        ]).start();

        await logAction(
            newSaved ? INTERACTION_TYPES.SAVE : INTERACTION_TYPES.DISMISS,
            newSaved ? "Place saved to your collection." : null,
        );
    }

    async function handleDismiss() {
        await logAction(
            INTERACTION_TYPES.DISMISS,
            "We'll show fewer places like this.",
        );
        navigation.goBack();
    }

    async function handleCta() {
        await logAction(INTERACTION_TYPES.CLICK);
        Alert.alert(
            getCtaLabel(place?.type ?? ""),
            `Coming soon! We'll add full booking for ${place?.name ?? "this place"} soon.`,
        );
    }

    // Parse numeric score for star display
    const numericScore = useMemo(() => {
        const s = place?.score ?? "";
        const m = String(s).match(/(\d+)/);
        if (m) return parseInt(m[1], 10);
        return null;
    }, [place?.score]);

    const ratingDisplay = numericScore ? (numericScore / 20).toFixed(1) : null;

    return (
        <SafeAreaView
            style={[styles.safeArea, { backgroundColor: palette.pageTop }]}
            edges={["top"]}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={[2]}
                contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
                bounces
            >
                {/* 1. Image Carousel — idx 0 */}
                <ImageCarousel
                    place={place}
                    details={details}
                    palette={palette}
                    isDark={isDark}
                    onBack={() => navigation.goBack()}
                    onSave={handleSave}
                    isSaved={isSaved}
                />

                {/* 2. Place header + info cards — idx 1 */}
                <View style={styles.headerSection}>
                    <LinearGradient
                        colors={gradients.appBackground}
                        style={StyleSheet.absoluteFillObject}
                    />

                    {/* Name row */}
                    <View style={styles.nameRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.placeName}>
                                {place?.name ?? "Place"}
                            </Text>
                            <Text style={styles.placeType}>
                                {place?.type ?? "Spot"}
                            </Text>
                        </View>
                        {ratingDisplay ? (
                            <View style={styles.ratingBadge}>
                                <Ionicons name="star" size={13} color="#F5A623" />
                                <Text style={styles.ratingBadgeText}>
                                    {ratingDisplay}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {/* Info cards: Distance + Hours */}
                    <View style={styles.infoCardsRow}>
                        <View
                            style={[
                                styles.infoCard,
                                {
                                    backgroundColor: isDark
                                        ? "rgba(18,38,62,0.85)"
                                        : "rgba(255,255,255,0.92)",
                                    borderColor: palette.borderSoft,
                                },
                            ]}
                        >
                            <View style={styles.infoCardTop}>
                                <Ionicons
                                    name="location-outline"
                                    size={14}
                                    color={palette.textMuted}
                                />
                                <Text
                                    style={[
                                        styles.infoCardLabel,
                                        { color: palette.textMuted },
                                    ]}
                                >
                                    Distance
                                </Text>
                            </View>
                            <Text
                                style={[
                                    styles.infoCardValue,
                                    { color: palette.textPrimary },
                                ]}
                            >
                                {place?.distance ?? "Nearby"}
                            </Text>
                        </View>

                        <View
                            style={[
                                styles.infoCard,
                                {
                                    backgroundColor: isDark
                                        ? "rgba(18,38,62,0.85)"
                                        : "rgba(255,255,255,0.92)",
                                    borderColor: palette.borderSoft,
                                },
                            ]}
                        >
                            <View style={styles.infoCardTop}>
                                <Ionicons
                                    name="time-outline"
                                    size={14}
                                    color={palette.textMuted}
                                />
                                <Text
                                    style={[
                                        styles.infoCardLabel,
                                        { color: palette.textMuted },
                                    ]}
                                >
                                    Hours
                                </Text>
                            </View>
                            <Text
                                style={[
                                    styles.infoCardValue,
                                    { color: palette.textPrimary },
                                ]}
                            >
                                {place?.isOpen === false
                                    ? "Closed"
                                    : place?.hoursDisplay?.toLowerCase().includes("24")
                                      ? "Open 24/7"
                                      : "Open Now"}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* 3. Tab bar — idx 2 (sticky) */}
                <View
                    style={[
                        styles.stickyTabWrap,
                        {
                            backgroundColor: isDark
                                ? palette.pageTop
                                : palette.pageTop,
                        },
                    ]}
                >
                    <TabBar
                        active={activeTab}
                        onChange={setActiveTab}
                        palette={palette}
                        isDark={isDark}
                    />
                </View>

                {/* 4. Tab content — idx 3 */}
                <View
                    style={[
                        styles.tabContentWrap,
                        {
                            backgroundColor: isDark
                                ? "rgba(6,10,20,0.0)"
                                : "rgba(235,248,255,0.0)",
                        },
                    ]}
                >
                    {activeTab === "Overview" && (
                        <OverviewTab
                            place={place}
                            details={details}
                            palette={palette}
                            isDark={isDark}
                            styles={styles}
                        />
                    )}
                    {activeTab === "Reviews" && (
                        <ReviewsTab
                            place={place}
                            details={details}
                            palette={palette}
                            isDark={isDark}
                            styles={styles}
                        />
                    )}
                    {activeTab === "Map" && (
                        <MapTab
                            place={place}
                            details={details}
                            palette={palette}
                            isDark={isDark}
                            styles={styles}
                        />
                    )}
                </View>
            </ScrollView>

            {/* Sticky bottom bar */}
            <View
                style={[
                    styles.bottomBar,
                    {
                        paddingBottom: bottomPad,
                        backgroundColor: isDark
                            ? "rgba(6,10,20,0.96)"
                            : "rgba(248,253,255,0.97)",
                        borderTopColor: palette.borderSoft,
                    },
                ]}
            >
                {/* Dismiss (not interested) */}
                <Pressable
                    onPress={handleDismiss}
                    style={[
                        styles.dismissBtn,
                        {
                            borderColor: palette.borderStrong,
                            backgroundColor: isDark
                                ? "rgba(20,42,70,0.8)"
                                : "rgba(255,255,255,0.9)",
                        },
                    ]}
                >
                    <Ionicons
                        name="close-outline"
                        size={18}
                        color={palette.textMuted}
                    />
                </Pressable>

                {/* Price + CTA */}
                <View style={styles.priceCtaGroup}>
                    <View style={styles.priceWrap}>
                        <Text
                            style={[styles.priceFrom, { color: palette.textMuted }]}
                        >
                            $ From
                        </Text>
                        <Text
                            style={[
                                styles.priceValue,
                                { color: palette.textPrimary },
                            ]}
                        >
                            {getPriceLabel(place)}
                        </Text>
                    </View>

                    <Pressable
                        onPress={handleCta}
                        style={styles.ctaBtnWrap}
                    >
                        <LinearGradient
                            colors={gradients.primaryButton}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.ctaBtn}
                        >
                            <Text style={styles.ctaBtnText}>
                                {getCtaLabel(place?.type ?? "")}
                            </Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safeArea: { flex: 1 },

        // Header section
        headerSection: {
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            overflow: "hidden",
        },
        nameRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
        },
        placeName: {
            color: palette.textPrimary,
            fontSize: 22,
            fontWeight: "900",
            lineHeight: 28,
        },
        placeType: {
            color: palette.oceanBlue,
            fontSize: 13,
            fontWeight: "700",
            marginTop: 3,
        },
        ratingBadge: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: isDark
                ? "rgba(40,30,10,0.9)"
                : "rgba(255,246,220,0.95)",
            borderWidth: 1,
            borderColor: isDark
                ? "rgba(245,166,35,0.35)"
                : "rgba(245,166,35,0.4)",
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 5,
            marginTop: 4,
        },
        ratingBadgeText: {
            color: "#F5A623",
            fontWeight: "800",
            fontSize: 13,
        },
        infoCardsRow: {
            flexDirection: "row",
            gap: 10,
        },
        infoCard: {
            flex: 1,
            borderRadius: 14,
            borderWidth: 1,
            padding: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
            elevation: 2,
        },
        infoCardTop: {
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginBottom: 8,
        },
        infoCardLabel: {
            fontSize: 12,
            fontWeight: "600",
        },
        infoCardValue: {
            fontSize: 16,
            fontWeight: "800",
        },

        // Sticky tab bar wrap
        stickyTabWrap: {
            paddingHorizontal: 16,
            paddingVertical: 8,
        },

        // Tab content wrapper
        tabContentWrap: {
            paddingHorizontal: 16,
        },
        tabContent: {
            paddingTop: 4,
        },

        // Shared section
        section: {
            marginTop: 16,
        },
        sectionTitle: {
            color: palette.textPrimary,
            fontSize: 15,
            fontWeight: "800",
            marginBottom: 10,
        },
        bodyText: {
            color: palette.textSecondary,
            fontSize: 14,
            lineHeight: 22,
        },

        // Amenity chips
        chipRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        chip: {
            borderRadius: 999,
            borderWidth: 1,
            paddingHorizontal: 12,
            paddingVertical: 6,
        },
        chipText: {
            fontSize: 12,
            fontWeight: "600",
        },

        // Contact
        contactRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
        },
        contactIconBox: {
            width: 34,
            height: 34,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
        },
        contactText: {
            fontSize: 14,
            fontWeight: "600",
            flex: 1,
        },

        // Reviews
        reviewSummary: {
            borderRadius: 16,
            borderWidth: 1,
            padding: 14,
            marginTop: 8,
            alignItems: "center",
        },
        ratingBig: {
            alignItems: "center",
            gap: 6,
        },
        ratingBigNum: {
            fontSize: 36,
            fontWeight: "900",
        },
        ratingCount: {
            fontSize: 12,
            fontWeight: "600",
        },
        reviewCard: {
            borderRadius: 16,
            borderWidth: 1,
            padding: 14,
            marginTop: 10,
        },
        reviewHeader: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 10,
        },
        reviewAvatar: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(56,174,255,0.2)",
            alignItems: "center",
            justifyContent: "center",
        },
        reviewAvatarText: {
            color: palette.oceanBlue,
            fontWeight: "800",
            fontSize: 14,
        },
        reviewNameRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 4,
        },
        reviewName: {
            fontWeight: "700",
            fontSize: 13,
        },
        reviewTime: {
            fontSize: 11,
        },
        reviewComment: {
            fontSize: 13,
            lineHeight: 20,
        },

        // Map
        mapShell: {
            height: 220,
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: palette.borderStrong,
            marginTop: 8,
            backgroundColor: palette.surface,
        },
        mapFallback: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
        },
        mapFallbackTitle: {
            fontSize: 16,
            fontWeight: "800",
        },
        mapFallbackSub: {
            fontSize: 12,
            fontWeight: "600",
        },
        mapOpenRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
        },
        mapOpenText: {
            fontSize: 12,
            fontWeight: "700",
        },
        mapOpenHint: {
            position: "absolute",
            bottom: 10,
            right: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        mapOpenHintText: {
            fontSize: 11,
            fontWeight: "800",
        },
        mapNoCoords: {
            height: 180,
            borderRadius: 18,
            borderWidth: 1,
            marginTop: 8,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
        },
        mapNoCoordsText: {
            fontSize: 13,
            fontWeight: "600",
        },
        addressCard: {
            borderRadius: 14,
            borderWidth: 1,
            padding: 12,
            marginTop: 10,
        },
        addressText: {
            flex: 1,
            fontSize: 14,
            fontWeight: "600",
            lineHeight: 20,
        },
        coordsText: {
            fontSize: 10,
            marginTop: 6,
            marginLeft: 28,
        },

        // Bottom bar
        bottomBar: {
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingTop: 12,
            paddingHorizontal: 16,
            borderTopWidth: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        dismissBtn: {
            width: 46,
            height: 46,
            borderRadius: 14,
            borderWidth: 1,
            alignItems: "center",
            justifyContent: "center",
        },
        priceCtaGroup: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        priceWrap: {
            gap: 1,
        },
        priceFrom: {
            fontSize: 11,
            fontWeight: "600",
        },
        priceValue: {
            fontSize: 15,
            fontWeight: "900",
        },
        ctaBtnWrap: {
            flex: 1,
            borderRadius: 14,
            overflow: "hidden",
        },
        ctaBtn: {
            height: 46,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2EA9FF",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.28,
            shadowRadius: 12,
            elevation: 6,
        },
        ctaBtnText: {
            color: palette.iceWhite,
            fontSize: 14,
            fontWeight: "800",
        },
    });
}
