/**
 * NotificationSettingsScreen.js
 *
 * Full notification preferences management.
 * Defaults are seeded from onboarding data (wakeTime, lunchTime, sleepTime).
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    Alert,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNotifications } from "../context/NotificationContext";
import { useAppTheme } from "../context/ThemeContext";

const SECTION_SPACING = 24;

function parseTimeToDate(timeStr) {
    const [h, m] = (timeStr ?? "08:00").split(":").map(Number);
    const d = new Date();
    d.setHours(isNaN(h) ? 8 : h, isNaN(m) ? 0 : m, 0, 0);
    return d;
}

function formatTimeStr(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

function displayTime(timeStr) {
    const [hourStr, minuteStr] = (timeStr ?? "08:00").split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${String(minute).padStart(2, "0")} ${ampm}`;
}

export default function NotificationSettingsScreen({ navigation }) {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette, isDark),
        [palette, isDark],
    );

    const {
        preferences,
        updatePreferences,
        permissionStatus,
        requestPermissions,
    } = useNotifications();

    const [pickerState, setPickerState] = useState({
        visible: false,
        field: null,
    });

    const handleToggle = useCallback(
        (field, value) => {
            updatePreferences({ [field]: value });
        },
        [updatePreferences],
    );

    const handleTimeChange = useCallback(
        (event, selectedDate) => {
            if (Platform.OS === "android") {
                setPickerState({ visible: false, field: null });
            }
            if (selectedDate && pickerState.field) {
                updatePreferences({
                    [pickerState.field]: formatTimeStr(selectedDate),
                });
            }
        },
        [pickerState.field, updatePreferences],
    );

    const openPicker = useCallback((field) => {
        setPickerState({ visible: true, field });
    }, []);

    const closePicker = useCallback(() => {
        setPickerState({ visible: false, field: null });
    }, []);

    const openSystemSettings = useCallback(() => {
        Linking.openSettings();
    }, []);

    const handleEnableFromSettings = useCallback(async () => {
        if (permissionStatus === "denied") {
            Alert.alert(
                "Enable Notifications",
                "Notifications are currently blocked. Open your device settings to enable them.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Open Settings",
                        onPress: openSystemSettings,
                    },
                ],
            );
        } else {
            await requestPermissions();
        }
    }, [permissionStatus, requestPermissions, openSystemSettings]);

    const isGranted = permissionStatus === "granted";
    const isDenied = permissionStatus === "denied";

    return (
        <SafeAreaView style={styles.safe}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.gradient}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Pressable
                        style={styles.backBtn}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons
                            name="arrow-back"
                            size={22}
                            color={palette.textPrimary}
                        />
                    </Pressable>
                    <Text style={styles.headerTitle}>Notifications</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Permission banner */}
                    {!isGranted && (
                        <Pressable
                            style={styles.permissionBanner}
                            onPress={handleEnableFromSettings}
                        >
                            <LinearGradient
                                colors={
                                    isDenied
                                        ? [palette.danger, "#c0392b"]
                                        : gradients.primaryButtonMint
                                }
                                style={styles.permissionBannerGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Ionicons
                                    name={
                                        isDenied
                                            ? "notifications-off-outline"
                                            : "notifications-outline"
                                    }
                                    size={20}
                                    color="#fff"
                                />
                                <Text style={styles.permissionBannerText}>
                                    {isDenied
                                        ? "Notifications blocked — tap to open Settings"
                                        : "Tap to enable notifications"}
                                </Text>
                                <Ionicons
                                    name="chevron-forward"
                                    size={16}
                                    color="rgba(255,255,255,0.8)"
                                />
                            </LinearGradient>
                        </Pressable>
                    )}

                    {/* Master toggle */}
                    <SectionCard style={styles.card}>
                        <SettingRow
                            icon="notifications-outline"
                            iconColor={palette.oceanBlue}
                            label="All Notifications"
                            description="Master switch for all Wuloye notifications"
                            value={preferences.enabled && isGranted}
                            onValueChange={(v) => {
                                if (!isGranted) {
                                    handleEnableFromSettings();
                                    return;
                                }
                                handleToggle("enabled", v);
                            }}
                            palette={palette}
                            styles={styles}
                        />
                    </SectionCard>

                    {/* Morning */}
                    <SectionLabel
                        label="Morning Briefing"
                        icon="sunny-outline"
                        iconColor="#f39c12"
                        styles={styles}
                        palette={palette}
                    />
                    <SectionCard style={styles.card}>
                        <SettingRow
                            icon="sunny-outline"
                            iconColor="#f39c12"
                            label="Morning Notification"
                            description="Daily greeting, AI day summary, and schedule"
                            value={preferences.morningEnabled}
                            onValueChange={(v) =>
                                handleToggle("morningEnabled", v)
                            }
                            palette={palette}
                            styles={styles}
                        />
                        <Divider palette={palette} />
                        <TimeRow
                            label="Wake Time"
                            time={preferences.morningTime}
                            onPress={() => openPicker("morningTime")}
                            palette={palette}
                            styles={styles}
                        />
                    </SectionCard>

                    {/* Afternoon */}
                    <SectionLabel
                        label="Midday Suggestions"
                        icon="restaurant-outline"
                        iconColor={palette.mint}
                        styles={styles}
                        palette={palette}
                    />
                    <SectionCard style={styles.card}>
                        <SettingRow
                            icon="restaurant-outline"
                            iconColor={palette.mint}
                            label="Afternoon Notification"
                            description="Lunch spots, midday activities, and nearby picks"
                            value={preferences.afternoonEnabled}
                            onValueChange={(v) =>
                                handleToggle("afternoonEnabled", v)
                            }
                            palette={palette}
                            styles={styles}
                        />
                        <Divider palette={palette} />
                        <TimeRow
                            label="Afternoon Time"
                            time={preferences.afternoonTime}
                            onPress={() => openPicker("afternoonTime")}
                            palette={palette}
                            styles={styles}
                        />
                    </SectionCard>

                    {/* Evening */}
                    <SectionLabel
                        label="Evening Recap"
                        icon="moon-outline"
                        iconColor={palette.deepBlue}
                        styles={styles}
                        palette={palette}
                    />
                    <SectionCard style={styles.card}>
                        <SettingRow
                            icon="moon-outline"
                            iconColor={palette.deepBlue}
                            label="Evening Notification"
                            description="Evening plan, relaxation suggestions, and tomorrow's prep"
                            value={preferences.eveningEnabled}
                            onValueChange={(v) =>
                                handleToggle("eveningEnabled", v)
                            }
                            palette={palette}
                            styles={styles}
                        />
                        <Divider palette={palette} />
                        <TimeRow
                            label="Evening Time"
                            time={preferences.eveningTime}
                            onPress={() => openPicker("eveningTime")}
                            palette={palette}
                            styles={styles}
                        />
                    </SectionCard>

                    {/* Smart / AI */}
                    <SectionLabel
                        label="Smart Suggestions"
                        icon="sparkles-outline"
                        iconColor={palette.oceanBlue}
                        styles={styles}
                        palette={palette}
                    />
                    <SectionCard style={styles.card}>
                        <SettingRow
                            icon="sparkles-outline"
                            iconColor={palette.oceanBlue}
                            label="AI Dynamic Notifications"
                            description="Context-aware suggestions from your AI assistant"
                            value={preferences.dynamicEnabled}
                            onValueChange={(v) =>
                                handleToggle("dynamicEnabled", v)
                            }
                            palette={palette}
                            styles={styles}
                        />
                        <Divider palette={palette} />
                        <SettingRow
                            icon="calendar-outline"
                            iconColor={palette.mint}
                            label="Event Reminders"
                            description="Notifications about events matching your interests"
                            value={preferences.eventReminders}
                            onValueChange={(v) =>
                                handleToggle("eventReminders", v)
                            }
                            palette={palette}
                            styles={styles}
                        />
                        <Divider palette={palette} />
                        <SettingRow
                            icon="compass-outline"
                            iconColor={palette.deepBlue}
                            label="Recommendation Alerts"
                            description="New nearby places that match your preferences"
                            value={preferences.recommendationReminders}
                            onValueChange={(v) =>
                                handleToggle("recommendationReminders", v)
                            }
                            palette={palette}
                            styles={styles}
                        />
                    </SectionCard>

                    {/* Sound & vibration */}
                    <SectionLabel
                        label="Sound & Vibration"
                        icon="volume-medium-outline"
                        iconColor={palette.textSecondary}
                        styles={styles}
                        palette={palette}
                    />
                    <SectionCard style={styles.card}>
                        <SettingRow
                            icon="volume-medium-outline"
                            iconColor={palette.textSecondary}
                            label="Sound"
                            value={preferences.sound}
                            onValueChange={(v) => handleToggle("sound", v)}
                            palette={palette}
                            styles={styles}
                        />
                        <Divider palette={palette} />
                        <SettingRow
                            icon="phone-portrait-outline"
                            iconColor={palette.textSecondary}
                            label="Vibration"
                            value={preferences.vibration}
                            onValueChange={(v) => handleToggle("vibration", v)}
                            palette={palette}
                            styles={styles}
                        />
                    </SectionCard>

                    {/* Info */}
                    <View style={styles.infoBox}>
                        <Ionicons
                            name="information-circle-outline"
                            size={16}
                            color={palette.textMuted}
                        />
                        <Text style={styles.infoText}>
                            Notification timing is intelligently adjusted by
                            your AI assistant based on your daily routine. At
                            most 3 smart suggestions are sent per day.
                        </Text>
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </LinearGradient>

            {/* Time picker */}
            {pickerState.visible && (
                <>
                    {Platform.OS === "ios" ? (
                        <View style={styles.iosPickerWrap}>
                            <View style={styles.iosPickerHeader}>
                                <Pressable onPress={closePicker}>
                                    <Text style={styles.iosPickerDone}>
                                        Done
                                    </Text>
                                </Pressable>
                            </View>
                            <DateTimePicker
                                value={parseTimeToDate(
                                    preferences[pickerState.field],
                                )}
                                mode="time"
                                display="spinner"
                                onChange={handleTimeChange}
                                themeVariant={isDark ? "dark" : "light"}
                            />
                        </View>
                    ) : (
                        <DateTimePicker
                            value={parseTimeToDate(
                                preferences[pickerState.field],
                            )}
                            mode="time"
                            display="default"
                            onChange={handleTimeChange}
                        />
                    )}
                </>
            )}
        </SafeAreaView>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ children, style }) {
    return <View style={[{ marginHorizontal: 20 }, style]}>{children}</View>;
}

function SectionLabel({ label, icon, iconColor, styles, palette }) {
    return (
        <View style={styles.sectionLabel}>
            <Ionicons name={icon} size={15} color={iconColor} />
            <Text style={styles.sectionLabelText}>{label}</Text>
        </View>
    );
}

function Divider({ palette }) {
    return (
        <View
            style={{
                height: 1,
                backgroundColor: palette.borderSoft,
                marginHorizontal: 16,
            }}
        />
    );
}

function SettingRow({
    icon,
    iconColor,
    label,
    description,
    value,
    onValueChange,
    palette,
    styles,
}) {
    return (
        <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: `${iconColor}18` }]}>
                <Ionicons name={icon} size={18} color={iconColor} />
            </View>
            <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{label}</Text>
                {description ? (
                    <Text style={styles.settingDesc}>{description}</Text>
                ) : null}
            </View>
            <Switch
                value={!!value}
                onValueChange={onValueChange}
                trackColor={{
                    false: palette.borderSoft,
                    true: palette.mint,
                }}
                thumbColor={value ? "#fff" : palette.textMuted}
                ios_backgroundColor={palette.borderSoft}
            />
        </View>
    );
}

function TimeRow({ label, time, onPress, palette, styles }) {
    return (
        <Pressable style={styles.settingRow} onPress={onPress}>
            <View style={[styles.settingIcon, { backgroundColor: `${palette.oceanBlue}18` }]}>
                <Ionicons name="time-outline" size={18} color={palette.oceanBlue} />
            </View>
            <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{label}</Text>
            </View>
            <View style={styles.timePill}>
                <Text style={styles.timeText}>{displayTime(time)}</Text>
                <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={palette.textMuted}
                />
            </View>
        </Pressable>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safe: { flex: 1, backgroundColor: palette.pageTop },
        gradient: { flex: 1 },
        header: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 8,
        },
        backBtn: {
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        headerTitle: {
            fontSize: 18,
            fontWeight: "700",
            color: palette.textPrimary,
        },
        scroll: {
            paddingTop: 8,
        },
        permissionBanner: {
            marginHorizontal: 20,
            marginBottom: 20,
            borderRadius: 14,
            overflow: "hidden",
        },
        permissionBannerGrad: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 10,
        },
        permissionBannerText: {
            flex: 1,
            color: "#fff",
            fontSize: 14,
            fontWeight: "600",
        },
        sectionLabel: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginHorizontal: 24,
            marginTop: SECTION_SPACING,
            marginBottom: 10,
        },
        sectionLabelText: {
            fontSize: 13,
            fontWeight: "600",
            color: palette.textMuted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },
        card: {
            backgroundColor: palette.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            overflow: "hidden",
        },
        settingRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 12,
        },
        settingIcon: {
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
        },
        settingInfo: {
            flex: 1,
        },
        settingLabel: {
            fontSize: 15,
            fontWeight: "600",
            color: palette.textPrimary,
        },
        settingDesc: {
            fontSize: 12,
            color: palette.textMuted,
            marginTop: 2,
            lineHeight: 17,
        },
        timePill: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: palette.borderSoft,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 8,
        },
        timeText: {
            fontSize: 14,
            fontWeight: "600",
            color: palette.textPrimary,
        },
        infoBox: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            marginHorizontal: 24,
            marginTop: 24,
            padding: 14,
            backgroundColor: isDark
                ? "rgba(56,174,255,0.08)"
                : "rgba(56,174,255,0.06)",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isDark
                ? "rgba(56,174,255,0.2)"
                : "rgba(56,174,255,0.15)",
        },
        infoText: {
            flex: 1,
            fontSize: 12,
            color: palette.textMuted,
            lineHeight: 18,
        },
        iosPickerWrap: {
            backgroundColor: isDark ? palette.pageMid : "#fff",
            borderTopWidth: 1,
            borderColor: palette.borderSoft,
        },
        iosPickerHeader: {
            flexDirection: "row",
            justifyContent: "flex-end",
            padding: 12,
        },
        iosPickerDone: {
            color: palette.oceanBlue,
            fontSize: 16,
            fontWeight: "600",
        },
    });
}
