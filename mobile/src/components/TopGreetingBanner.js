import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../context/ThemeContext";

export default function TopGreetingBanner({
    eyebrow,
    title,
    subtitle,
    onAction,
}) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );

    return (
        <LinearGradient
            colors={
                isDark
                    ? [
                          "rgba(30,82,130,0.86)",
                          "rgba(22,63,102,0.9)",
                          "rgba(20,109,82,0.88)",
                      ]
                    : [
                          "rgba(141,219,255,0.95)",
                          "rgba(77,182,255,0.92)",
                          "rgba(74,210,152,0.9)",
                      ]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
        >
            <View style={styles.textWrap}>
                {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
                <Text style={styles.title}>{title}</Text>
                {subtitle ? (
                    <Text style={styles.subtitle}>{subtitle}</Text>
                ) : null}
            </View>

            {onAction ? (
                <Pressable style={styles.actionButtonWrap} onPress={onAction}>
                    <LinearGradient
                        colors={
                            isDark
                                ? ["rgba(16,39,64,0.96)", "rgba(21,61,89,0.92)"]
                                : gradients.navActivePill
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.actionButton}
                    >
                        <Ionicons
                            name="notifications-outline"
                            size={18}
                            color={isDark ? palette.iceWhite : palette.iceWhite}
                        />
                    </LinearGradient>
                </Pressable>
            ) : null}
        </LinearGradient>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        banner: {
            marginTop: 4,
            borderRadius: 20,
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: isDark
                ? "rgba(147, 211, 255, 0.34)"
                : "rgba(255,255,255,0.55)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            shadowColor: "#0E2D4F",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.32 : 0.2,
            shadowRadius: 14,
            elevation: 10,
        },
        textWrap: {
            flex: 1,
            paddingRight: 10,
        },
        eyebrow: {
            color: "rgba(248,254,255,0.9)",
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
            fontWeight: "800",
        },
        title: {
            marginTop: 4,
            color: palette.iceWhite,
            fontSize: 23,
            lineHeight: 28,
            fontWeight: "900",
        },
        subtitle: {
            marginTop: 4,
            color: "rgba(248,254,255,0.92)",
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "600",
        },
        actionButtonWrap: {
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: isDark
                ? "rgba(145, 211, 255, 0.46)"
                : "rgba(255,255,255,0.55)",
            overflow: "hidden",
        },
        actionButton: {
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
        },
    });
}
