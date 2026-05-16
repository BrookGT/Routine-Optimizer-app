import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Alert,
    Animated,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/Loader";
import { useSavedPlaces } from "../hooks/useSavedPlaces";
import { getProfile, updateProfile, checkUsernameAvailability } from "../api/profileApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { THEMES } from "../theme/theme";
import { useAppTheme } from "../context/ThemeContext";

const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

function formatLabel(value) {
    if (!value || typeof value !== "string") return "Not set";
    if (value.includes("_")) {
        return value
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function getAvatarInitials(name) {
    if (!name || typeof name !== "string") return "W";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
}

function formatMemberSince(createdAt) {
    if (!createdAt) return null;
    try {
        const date = new Date(createdAt);
        return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch {
        return null;
    }
}

// ─── Username Editor ──────────────────────────────────────────────────────────

function UsernameEditor({ currentUsername, onSave, onCancel, palette, styles }) {
    const [value, setValue] = useState(currentUsername ?? "");
    const [checking, setChecking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null); // null | 'valid' | 'taken' | 'invalid' | 'checking'
    const debounceRef = useRef(null);

    useEffect(() => {
        const raw = value.trim().toLowerCase();
        if (!raw || raw === (currentUsername ?? "")) {
            setStatus(null);
            return;
        }
        if (!USERNAME_REGEX.test(raw)) {
            setStatus("invalid");
            return;
        }
        setStatus("checking");
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            try {
                setChecking(true);
                const result = await checkUsernameAvailability(raw);
                setStatus(result.available ? "valid" : "taken");
            } catch {
                setStatus(null);
            } finally {
                setChecking(false);
            }
        }, 500);
        return () => clearTimeout(debounceRef.current);
    }, [value, currentUsername]);

    async function handleSave() {
        const raw = value.trim().toLowerCase();
        if (!USERNAME_REGEX.test(raw)) {
            Alert.alert(
                "Invalid username",
                "3–20 characters, start with a letter, only lowercase letters, numbers, and underscores.",
            );
            return;
        }
        try {
            setSaving(true);
            await onSave(raw);
        } finally {
            setSaving(false);
        }
    }

    const statusColor =
        status === "valid"
            ? palette.mint
            : status === "taken" || status === "invalid"
              ? palette.danger
              : palette.textMuted;

    const statusText =
        status === "valid"
            ? "Available"
            : status === "taken"
              ? "Already taken"
              : status === "invalid"
                ? "3–20 chars, start with a letter, a–z 0–9 _"
                : status === "checking"
                  ? "Checking…"
                  : "";

    const canSave =
        status === "valid" ||
        (value.trim().toLowerCase() === (currentUsername ?? "") &&
            USERNAME_REGEX.test(value.trim().toLowerCase()));

    return (
        <View style={styles.usernameEditorWrap}>
            <View style={styles.usernameEditorRow}>
                <Text style={styles.usernameAtPrefix}>@</Text>
                <TextInput
                    value={value}
                    onChangeText={(t) => setValue(t.toLowerCase().replace(/\s/g, ""))}
                    style={styles.usernameInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    maxLength={20}
                    placeholder="your_username"
                    placeholderTextColor={palette.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={canSave ? handleSave : undefined}
                />
                {checking ? (
                    <Ionicons name="sync" size={16} color={palette.textMuted} />
                ) : null}
            </View>
            {statusText ? (
                <Text style={[styles.usernameStatusText, { color: statusColor }]}>
                    {statusText}
                </Text>
            ) : null}
            <View style={styles.usernameEditorActions}>
                <Pressable onPress={onCancel} style={styles.usernameEditorCancelBtn}>
                    <Text style={styles.usernameEditorCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                    onPress={handleSave}
                    disabled={!canSave || saving}
                    style={[
                        styles.usernameEditorSaveBtn,
                        (!canSave || saving) && styles.usernameEditorSaveBtnDisabled,
                    ]}
                >
                    <Text style={styles.usernameEditorSaveText}>
                        {saving ? "Saving…" : "Save"}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────

export default function ProfileScreen({ navigation }) {
    const { palette, gradients, mode, isDark, setThemeMode } = useAppTheme();
    const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);

    const thumbAnim = useRef(new Animated.Value(mode === THEMES.DARK ? 1 : 0)).current;
    useEffect(() => {
        Animated.timing(thumbAnim, {
            toValue: mode === THEMES.DARK ? 1 : 0,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [mode, thumbAnim]);

    const { clearAuth, refreshProfile: refreshAuthProfile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [profile, setProfile] = useState(null);
    const [editingUsername, setEditingUsername] = useState(false);

    const loadProfile = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            setError("");
            const envelope = await getProfile();
            const data = unwrapApiData(envelope, null);
            setProfile(data);
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load profile."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const {
        loading: savedLoading,
        saved,
        loadSaved,
        handleRefresh: refreshSavedPlaces,
    } = useSavedPlaces();

    const savedLoadedOnce = useRef(false);

    useFocusEffect(
        useCallback(() => {
            loadSaved({ silent: savedLoadedOnce.current });
            savedLoadedOnce.current = true;
        }, [loadSaved]),
    );

    const [pullRefreshing, setPullRefreshing] = useState(false);
    async function handlePullRefresh() {
        setPullRefreshing(true);
        try {
            await Promise.all([loadProfile(true), refreshSavedPlaces()]);
        } finally {
            setPullRefreshing(false);
        }
    }

    async function handleSaveUsername(newUsername) {
        try {
            await updateProfile({ username: newUsername });
            setProfile((prev) => ({ ...prev, username: newUsername }));
            await refreshAuthProfile();
            setEditingUsername(false);
        } catch (err) {
            Alert.alert("Could not update username", getApiErrorMessage(err));
        }
    }

    function openSavedPlacesScreen() {
        const parent =
            typeof navigation.getParent === "function"
                ? navigation.getParent()
                : null;
        if (parent?.navigate) {
            parent.navigate("SavedPlaces");
            return;
        }
        navigation.navigate("SavedPlaces");
    }

    // ── Derived display values ──────────────────────────────────────────────
    const interests = Array.isArray(profile?.interests) ? profile.interests : [];
    // Prefer username as the display identity (new onboarding v3);
    // fall back to legacy name field for existing users who haven't re-onboarded.
    const username    = profile?.username ?? null;
    const displayName = username ? `@${username}` : profile?.name?.trim() || "Wuloye User";
    const initials    = getAvatarInitials(username || profile?.name || "Wuloye User");
    const memberSince = formatMemberSince(profile?.createdAt);

    const budget =
        typeof profile?.weeklyBudget === "number"
            ? `${Math.round(profile.weeklyBudget)} / week · ${formatLabel(profile?.budgetRange)}`
            : formatLabel(profile?.budgetRange);
    const location = formatLabel(profile?.locationPreference);

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={gradients.appBackground} style={styles.screen}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={pullRefreshing}
                            onRefresh={handlePullRefresh}
                            tintColor={palette.oceanBlue}
                            colors={[palette.oceanBlue]}
                        />
                    }
                >
                    {/* ── Hero Header ─────────────────────────────────────── */}
                    <View style={styles.heroCard}>
                        <LinearGradient
                            colors={
                                isDark
                                    ? ["#0D2240", "#0C2C45", "#0E3A30"]
                                    : ["#E6F5FF", "#D6F0FF", "#D4F5E9"]
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroGradient}
                        >
                            {/* Top row: theme toggle + actions */}
                            <View style={styles.heroTopRow}>
                                <View style={styles.heroTopActions}>
                                    <Pressable
                                        style={styles.themeToggle}
                                        onPress={() =>
                                            setThemeMode(
                                                mode === THEMES.DARK
                                                    ? THEMES.LIGHT
                                                    : THEMES.DARK,
                                            )
                                        }
                                        accessibilityLabel="Toggle theme"
                                    >
                                        <Animated.View
                                            style={[
                                                styles.themeThumb,
                                                {
                                                    transform: [
                                                        {
                                                            translateX: thumbAnim.interpolate({
                                                                inputRange: [0, 1],
                                                                outputRange: [2, 24],
                                                            }),
                                                        },
                                                    ],
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name={
                                                    mode === THEMES.DARK ? "moon" : "sunny"
                                                }
                                                size={12}
                                                color={palette.deepBlue}
                                            />
                                        </Animated.View>
                                    </Pressable>

                                    <Pressable
                                        style={styles.heroIconBtn}
                                        onPress={() => loadProfile(true)}
                                        accessibilityLabel="Refresh profile"
                                    >
                                        <Ionicons
                                            name="refresh"
                                            size={16}
                                            color={palette.textSecondary}
                                        />
                                    </Pressable>
                                </View>
                            </View>

                            {/* Avatar */}
                            <LinearGradient
                                colors={gradients.primaryButtonMint}
                                style={styles.avatar}
                            >
                                <Text style={styles.avatarText}>{initials}</Text>
                            </LinearGradient>

                            {/* Name */}
                            <Text style={styles.heroName}>{displayName}</Text>

                            {/* Username row */}
                            {editingUsername ? (
                                <UsernameEditor
                                    currentUsername={username}
                                    onSave={handleSaveUsername}
                                    onCancel={() => setEditingUsername(false)}
                                    palette={palette}
                                    styles={styles}
                                />
                            ) : (
                                <Pressable
                                    style={styles.usernameRow}
                                    onPress={() => setEditingUsername(true)}
                                    accessibilityLabel="Edit username"
                                >
                                    <Text style={styles.usernameText}>
                                        {username ? `@${username}` : "Set a username"}
                                    </Text>
                                    <Ionicons
                                        name="pencil"
                                        size={12}
                                        color={palette.textMuted}
                                        style={styles.usernameEditIcon}
                                    />
                                </Pressable>
                            )}

                            {memberSince ? (
                                <View style={styles.memberBadge}>
                                    <Ionicons
                                        name="calendar-outline"
                                        size={11}
                                        color={palette.textMuted}
                                    />
                                    <Text style={styles.memberBadgeText}>
                                        Member since {memberSince}
                                    </Text>
                                </View>
                            ) : null}

                            {loading ? (
                                <View style={styles.heroLoader}>
                                    <Loader />
                                </View>
                            ) : null}
                            {error ? (
                                <Text style={styles.errorText}>{error}</Text>
                            ) : null}
                        </LinearGradient>
                    </View>

                    {/* ── Stats Row ───────────────────────────────────────── */}
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statNumber}>
                                {savedLoading ? "—" : saved.length}
                            </Text>
                            <Text style={styles.statLabel}>Saved</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statCard}>
                            <Text style={styles.statNumber}>{interests.length}</Text>
                            <Text style={styles.statLabel}>Interests</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statCard}>
                            <Text style={styles.statNumber}>
                                {typeof profile?.weeklyBudget === "number"
                                    ? Math.round(profile.weeklyBudget)
                                    : "—"}
                            </Text>
                            <Text style={styles.statLabel}>Budget/wk</Text>
                        </View>
                    </View>

                    {/* ── Preferences Section ─────────────────────────────── */}
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeader}>Preferences</Text>
                    </View>

                    {/* Interests */}
                    <View style={styles.prefCard}>
                        <View style={styles.prefCardHeader}>
                            <View style={styles.prefIconWrap}>
                                <Ionicons
                                    name="sparkles"
                                    size={16}
                                    color={palette.oceanBlue}
                                />
                            </View>
                            <Text style={styles.prefCardTitle}>Interests</Text>
                        </View>
                        <View style={styles.tagRow}>
                            {interests.length > 0 ? (
                                interests.map((interest) => (
                                    <View style={styles.tag} key={interest}>
                                        <Text style={styles.tagText}>
                                            {formatLabel(interest)}
                                        </Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.prefEmptyText}>
                                    No interests set — tap Edit Preferences to add some.
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Budget */}
                    <View style={styles.prefCard}>
                        <View style={styles.prefCardHeader}>
                            <View style={styles.prefIconWrap}>
                                <Ionicons
                                    name="wallet-outline"
                                    size={16}
                                    color={palette.mint}
                                />
                            </View>
                            <Text style={styles.prefCardTitle}>Weekly Budget</Text>
                        </View>
                        <Text style={styles.prefCardValue}>{budget}</Text>
                    </View>

                    {/* Location preference */}
                    <View style={styles.prefCard}>
                        <View style={styles.prefCardHeader}>
                            <View style={styles.prefIconWrap}>
                                <Ionicons
                                    name="location-outline"
                                    size={16}
                                    color={palette.emerald}
                                />
                            </View>
                            <Text style={styles.prefCardTitle}>
                                Location Preference
                            </Text>
                        </View>
                        <Text style={styles.prefCardValue}>{location}</Text>
                    </View>

                    {/* ── Saved Places ─────────────────────────────────────── */}
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeader}>My Collection</Text>
                    </View>

                    <Pressable
                        style={({ pressed }) => [
                            styles.savedCard,
                            pressed && styles.savedCardPressed,
                        ]}
                        onPress={openSavedPlacesScreen}
                        accessibilityRole="button"
                        accessibilityLabel="Open saved places"
                    >
                        <LinearGradient
                            colors={
                                isDark
                                    ? ["rgba(10,80,140,0.55)", "rgba(8,60,100,0.45)"]
                                    : ["rgba(220,244,255,0.85)", "rgba(210,250,235,0.85)"]
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.savedCardGradient}
                        >
                            <View style={styles.savedCardIconWrap}>
                                <Ionicons
                                    name="bookmark"
                                    size={24}
                                    color={palette.oceanBlue}
                                />
                            </View>
                            <View style={styles.savedCardTextCol}>
                                <Text style={styles.savedCardTitle}>
                                    Saved Places
                                </Text>
                                <Text style={styles.savedCardSub}>
                                    {savedLoading
                                        ? "Loading…"
                                        : saved.length === 0
                                          ? "Tap hearts on places you love"
                                          : `${saved.length} place${saved.length !== 1 ? "s" : ""} saved`}
                                </Text>
                            </View>
                            <Ionicons
                                name="chevron-forward"
                                size={20}
                                color={palette.textMuted}
                            />
                        </LinearGradient>
                    </Pressable>

                    {/* ── Actions ──────────────────────────────────────────── */}
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeader}>Account</Text>
                    </View>

                    <Pressable
                        style={styles.actionCard}
                        onPress={() => navigation.navigate("NotificationSettings")}
                        accessibilityRole="button"
                        accessibilityLabel="Notification settings"
                    >
                        <View style={styles.actionCardLeft}>
                            <View
                                style={[
                                    styles.actionIconWrap,
                                    { backgroundColor: "rgba(56,174,255,0.14)" },
                                ]}
                            >
                                <Ionicons
                                    name="notifications-outline"
                                    size={18}
                                    color={palette.oceanBlue}
                                />
                            </View>
                            <View>
                                <Text style={styles.actionCardTitle}>Notifications</Text>
                                <Text style={styles.actionCardSub}>
                                    AI reminders & timing
                                </Text>
                            </View>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={palette.textMuted}
                        />
                    </Pressable>

                    <Pressable
                        style={styles.actionCard}
                        onPress={() => navigation.navigate("ProfileSetup")}
                        accessibilityRole="button"
                    >
                        <View style={styles.actionCardLeft}>
                            <View style={[styles.actionIconWrap, { backgroundColor: "rgba(31,159,234,0.14)" }]}>
                                <Ionicons
                                    name="settings-outline"
                                    size={18}
                                    color={palette.oceanBlue}
                                />
                            </View>
                            <Text style={styles.actionCardTitle}>
                                Edit Preferences
                            </Text>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={palette.textMuted}
                        />
                    </Pressable>

                    <Pressable
                        style={[styles.actionCard, styles.actionCardDanger]}
                        onPress={async () => {
                            Alert.alert(
                                "Sign out",
                                "Are you sure you want to sign out?",
                                [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                        text: "Sign out",
                                        style: "destructive",
                                        onPress: clearAuth,
                                    },
                                ],
                            );
                        }}
                        accessibilityRole="button"
                    >
                        <View style={styles.actionCardLeft}>
                            <View style={[styles.actionIconWrap, { backgroundColor: "rgba(207,62,85,0.12)" }]}>
                                <Ionicons
                                    name="log-out-outline"
                                    size={18}
                                    color={palette.danger}
                                />
                            </View>
                            <Text style={[styles.actionCardTitle, { color: palette.danger }]}>
                                Sign Out
                            </Text>
                        </View>
                    </Pressable>
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette, isDark) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: palette.pageTop },
        screen: { flex: 1 },
        scrollContent: { paddingBottom: 120, paddingHorizontal: 16 },

        // ── Hero ──────────────────────────────────────────────────────────
        heroCard: {
            marginTop: 12,
            borderRadius: 24,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: palette.borderStrong,
        },
        heroGradient: {
            padding: 20,
            paddingBottom: 24,
            alignItems: "center",
        },
        heroTopRow: {
            alignSelf: "stretch",
            flexDirection: "row",
            justifyContent: "flex-end",
            marginBottom: 16,
        },
        heroTopActions: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        heroIconBtn: {
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: isDark
                ? "rgba(133,196,255,0.12)"
                : "rgba(133,196,255,0.18)",
            alignItems: "center",
            justifyContent: "center",
        },
        themeToggle: {
            width: 50,
            height: 28,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: isDark
                ? "rgba(101,173,235,0.3)"
                : "rgba(137,196,255,0.25)",
            paddingHorizontal: 2,
            justifyContent: "center",
        },
        themeThumb: {
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: palette.iceWhite,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.12,
            shadowRadius: 2,
            elevation: 2,
        },
        avatar: {
            width: 88,
            height: 88,
            borderRadius: 44,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2FAAFF",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 8,
        },
        avatarText: {
            color: "#fff",
            fontSize: 30,
            fontWeight: "800",
            letterSpacing: 1,
        },
        heroName: {
            marginTop: 14,
            color: palette.textPrimary,
            fontSize: 24,
            fontWeight: "800",
            textAlign: "center",
        },
        usernameRow: {
            marginTop: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: isDark
                ? "rgba(31,100,200,0.12)"
                : "rgba(31,159,234,0.08)",
        },
        usernameText: {
            color: palette.oceanBlue,
            fontSize: 14,
            fontWeight: "700",
        },
        usernameEditIcon: {
            marginLeft: 2,
        },
        memberBadge: {
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
        },
        memberBadgeText: {
            color: palette.textMuted,
            fontSize: 12,
        },
        heroLoader: {
            marginTop: 12,
        },
        errorText: {
            marginTop: 8,
            color: palette.danger,
            fontSize: 12,
            textAlign: "center",
        },

        // ── Username Editor ────────────────────────────────────────────────
        usernameEditorWrap: {
            marginTop: 8,
            alignSelf: "stretch",
            backgroundColor: isDark
                ? "rgba(10,40,80,0.55)"
                : "rgba(255,255,255,0.85)",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            padding: 14,
        },
        usernameEditorRow: {
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: isDark
                ? "rgba(18,40,70,0.8)"
                : "rgba(255,255,255,0.95)",
            paddingHorizontal: 10,
            height: 44,
            gap: 4,
        },
        usernameAtPrefix: {
            color: palette.textMuted,
            fontSize: 16,
            fontWeight: "700",
        },
        usernameInput: {
            flex: 1,
            color: palette.textPrimary,
            fontSize: 15,
            fontWeight: "600",
            height: "100%",
        },
        usernameStatusText: {
            marginTop: 6,
            fontSize: 12,
            fontWeight: "600",
        },
        usernameEditorActions: {
            marginTop: 10,
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 10,
        },
        usernameEditorCancelBtn: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.borderStrong,
        },
        usernameEditorCancelText: {
            color: palette.textSecondary,
            fontSize: 13,
            fontWeight: "700",
        },
        usernameEditorSaveBtn: {
            paddingHorizontal: 20,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: palette.oceanBlue,
        },
        usernameEditorSaveBtnDisabled: {
            opacity: 0.45,
        },
        usernameEditorSaveText: {
            color: "#fff",
            fontSize: 13,
            fontWeight: "800",
        },

        // ── Stats Row ──────────────────────────────────────────────────────
        statsRow: {
            marginTop: 12,
            flexDirection: "row",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            overflow: "hidden",
        },
        statCard: {
            flex: 1,
            paddingVertical: 16,
            alignItems: "center",
        },
        statDivider: {
            width: 1,
            marginVertical: 12,
            backgroundColor: palette.borderStrong,
        },
        statNumber: {
            color: palette.textPrimary,
            fontSize: 22,
            fontWeight: "800",
        },
        statLabel: {
            marginTop: 3,
            color: palette.textMuted,
            fontSize: 11,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },

        // ── Section Header ─────────────────────────────────────────────────
        sectionHeaderRow: {
            marginTop: 24,
            marginBottom: 10,
        },
        sectionHeader: {
            color: palette.textMuted,
            fontSize: 11,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 1,
        },

        // ── Preference Cards ───────────────────────────────────────────────
        prefCard: {
            marginBottom: 10,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 16,
        },
        prefCardHeader: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
        },
        prefIconWrap: {
            width: 32,
            height: 32,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surfaceStrong,
            alignItems: "center",
            justifyContent: "center",
        },
        prefCardTitle: {
            color: palette.textPrimary,
            fontSize: 15,
            fontWeight: "800",
        },
        prefCardValue: {
            color: palette.textPrimary,
            fontSize: 20,
            fontWeight: "800",
            marginTop: 2,
        },
        prefEmptyText: {
            color: palette.textMuted,
            fontSize: 13,
            lineHeight: 18,
            fontStyle: "italic",
        },
        tagRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        tag: {
            borderRadius: 999,
            backgroundColor: "rgba(31,159,234,0.13)",
            borderWidth: 1,
            borderColor: palette.borderStrong,
            paddingHorizontal: 11,
            paddingVertical: 5,
        },
        tagText: {
            color: palette.deepBlue,
            fontSize: 12,
            fontWeight: "700",
        },

        // ── Saved Places Card ──────────────────────────────────────────────
        savedCard: {
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: palette.borderStrong,
        },
        savedCardPressed: {
            opacity: 0.9,
            transform: [{ scale: 0.99 }],
        },
        savedCardGradient: {
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 16,
        },
        savedCardIconWrap: {
            width: 48,
            height: 48,
            borderRadius: 15,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: isDark
                ? "rgba(14,50,100,0.7)"
                : "rgba(255,255,255,0.75)",
            alignItems: "center",
            justifyContent: "center",
        },
        savedCardTextCol: { flex: 1 },
        savedCardTitle: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "800",
        },
        savedCardSub: {
            marginTop: 3,
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 18,
        },

        // ── Action Cards ───────────────────────────────────────────────────
        actionCard: {
            marginBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingVertical: 14,
            paddingHorizontal: 16,
        },
        actionCardDanger: {
            borderColor: "rgba(207,62,85,0.25)",
            backgroundColor: isDark
                ? "rgba(100,15,30,0.18)"
                : "rgba(255,235,238,0.6)",
        },
        actionCardLeft: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        actionIconWrap: {
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
        },
        actionCardTitle: {
            color: palette.textPrimary,
            fontSize: 15,
            fontWeight: "700",
        },
        actionCardSub: {
            marginTop: 2,
            color: palette.textMuted,
            fontSize: 12,
            fontWeight: "600",
        },
    });
}
