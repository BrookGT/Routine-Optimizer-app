import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

/**
 * Social-style action row for place detail screens.
 * Primary actions: like, dislike, save, share, directions, not interested.
 */
export default function PlaceInteractionBar({
    liked = false,
    disliked = false,
    saved = false,
    onLike,
    onDislike,
    onSave,
    onShare,
    onDirections,
    onNotInterested,
    compact = false,
}) {
    const { palette, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark, compact),
        [palette, isDark, compact],
    );

    const items = [
        {
            key: "like",
            icon: liked ? "heart" : "heart-outline",
            label: liked ? "Liked" : "Like",
            color: liked ? "#EF4444" : palette.textSecondary,
            onPress: onLike,
            active: liked,
        },
        {
            key: "dislike",
            icon: disliked ? "thumbs-down" : "thumbs-down-outline",
            label: "Pass",
            color: disliked ? palette.textMuted : palette.textSecondary,
            onPress: onDislike,
            active: disliked,
        },
        {
            key: "save",
            icon: saved ? "bookmark" : "bookmark-outline",
            label: saved ? "Saved" : "Save",
            color: saved ? palette.oceanBlue : palette.textSecondary,
            onPress: onSave,
            active: saved,
        },
        {
            key: "share",
            icon: "share-outline",
            label: "Share",
            color: palette.textSecondary,
            onPress: onShare,
        },
        {
            key: "directions",
            icon: "navigate-outline",
            label: "Go",
            color: palette.oceanBlue,
            onPress: onDirections,
            highlight: true,
        },
    ].filter((item) => typeof item.onPress === "function");

    return (
        <View style={styles.wrap}>
            <View style={styles.row}>
                {items.map((item) => (
                    <Pressable
                        key={item.key}
                        onPress={item.onPress}
                        style={({ pressed }) => [
                            styles.item,
                            item.highlight && styles.itemHighlight,
                            item.active && styles.itemActive,
                            pressed && styles.itemPressed,
                        ]}
                        hitSlop={6}
                    >
                        <Ionicons
                            name={item.icon}
                            size={compact ? 20 : 22}
                            color={item.highlight ? palette.oceanBlue : item.color}
                        />
                        <Text
                            style={[
                                styles.label,
                                item.active && { color: item.color, fontWeight: "700" },
                                item.highlight && { color: palette.oceanBlue },
                            ]}
                            numberOfLines={1}
                        >
                            {item.label}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {typeof onNotInterested === "function" ? (
                <Pressable
                    onPress={onNotInterested}
                    style={({ pressed }) => [
                        styles.notInterested,
                        pressed && { opacity: 0.7 },
                    ]}
                    hitSlop={8}
                >
                    <Ionicons
                        name="close-circle-outline"
                        size={14}
                        color={palette.textMuted}
                    />
                    <Text style={styles.notInterestedText}>Not for me</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function createStyles(palette, isDark, compact) {
    return StyleSheet.create({
        wrap: {
            marginTop: 4,
            marginBottom: 4,
        },
        row: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "stretch",
            backgroundColor: isDark
                ? "rgba(18,38,62,0.85)"
                : "rgba(255,255,255,0.95)",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            paddingVertical: compact ? 8 : 10,
            paddingHorizontal: 4,
        },
        item: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            paddingVertical: 4,
            borderRadius: 12,
        },
        itemHighlight: {
            backgroundColor: isDark
                ? "rgba(15,124,199,0.12)"
                : "rgba(15,124,199,0.08)",
        },
        itemActive: {
            backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
        },
        itemPressed: {
            opacity: 0.75,
        },
        label: {
            fontSize: compact ? 10 : 11,
            fontWeight: "600",
            color: palette.textMuted,
        },
        notInterested: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            marginTop: 10,
            paddingVertical: 6,
        },
        notInterestedText: {
            fontSize: 12,
            fontWeight: "600",
            color: palette.textMuted,
        },
    });
}
