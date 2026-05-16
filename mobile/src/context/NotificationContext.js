/**
 * NotificationContext.js — Intelligent Notification Provider
 *
 * Manages the full lifecycle of notifications:
 *   - Permission state
 *   - User preferences (from onboarding + settings)
 *   - Daily schedule refresh
 *   - Dynamic notification triggers
 *   - Notification response → navigation
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import {
    requestNotificationPermissions,
    getStoredPermissionStatus,
    loadPreferences,
    savePreferences,
    generateNotificationContent,
    scheduleDailyNotifications,
    sendDynamicNotification,
    extractNavigationFromResponse,
    logNotificationInteraction,
    setupAndroidChannels,
    hasShownPermissionScreen,
    DEFAULT_PREFERENCES,
    appendNotificationToInbox,
    mergePresentedNotificationsIntoInbox,
    loadNotificationInbox,
    countUnreadInbox,
    markInboxNotificationRead,
    markAllInboxNotificationsRead,
    normalizeNavigateTarget,
} from "../services/notificationService";

const NotificationContext = createContext(null);

export function useNotifications() {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        throw new Error(
            "useNotifications must be used inside NotificationProvider",
        );
    }
    return ctx;
}

export function NotificationProvider({ children, profile }) {
    const [permissionStatus, setPermissionStatus] = useState(null);
    const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
    const [showPermissionScreen, setShowPermissionScreen] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    /** In-app notification center (badge + list). */
    const [inbox, setInbox] = useState([]);

    const inboxUnreadCount = useMemo(
        () => countUnreadInbox(inbox),
        [inbox],
    );

    const navigationRef = useRef(null);
    const responseListenerRef = useRef(null);
    const foregroundListenerRef = useRef(null);
    const schedulingRef = useRef(false);

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    useEffect(() => {
        bootstrap();
        return () => {
            if (responseListenerRef.current) {
                Notifications.removeNotificationSubscription(
                    responseListenerRef.current,
                );
            }
            if (foregroundListenerRef.current) {
                Notifications.removeNotificationSubscription(
                    foregroundListenerRef.current,
                );
            }
        };
    }, []);

    // Re-schedule whenever the profile changes (e.g. after onboarding)
    useEffect(() => {
        if (isInitialized && profile && permissionStatus === "granted") {
            refreshDailySchedule();
        }
    }, [profile?.uid, isInitialized]);

    // Load inbox from storage + system tray (for badge after cold start).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list = await mergePresentedNotificationsIntoInbox();
                if (!cancelled) setInbox(list);
            } catch {
                if (!cancelled) {
                    const fallback = await loadNotificationInbox();
                    setInbox(fallback);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    async function bootstrap() {
        await setupAndroidChannels();

        // Load preferences (merging onboarding data)
        const prefs = await loadPreferences(profile);
        setPreferences(prefs);

        // Check permission status
        const stored = await getStoredPermissionStatus();
        setPermissionStatus(stored);

        // Decide whether to show the permission explanation screen
        if (!stored || stored === "undetermined") {
            const alreadyShown = await hasShownPermissionScreen();
            if (!alreadyShown) {
                setShowPermissionScreen(true);
            }
        }

        // Set up notification listeners
        setupListeners();

        // Handle any notification that was tapped while app was closed
        handleInitialNotificationResponse();

        setIsInitialized(true);

        // Schedule daily notifications if permission is already granted
        if (stored === "granted" && prefs.enabled) {
            await refreshDailySchedule(prefs);
        }
    }

    function setupListeners() {
        // Foreground notification received
        foregroundListenerRef.current =
            Notifications.addNotificationReceivedListener((notification) => {
                // Foreground notifications are shown automatically (handler above)
                logNotificationInteraction(
                    notification.request.identifier,
                    "received",
                    { type: notification.request.content.data?.type },
                );
                appendNotificationToInbox(notification).then(setInbox);
            });

        // Notification tapped (background or closed state)
        responseListenerRef.current =
            Notifications.addNotificationResponseReceivedListener((response) => {
                handleNotificationResponse(response);
            });
    }

    function handleNotificationResponse(response) {
        const notifId = response.notification.request.identifier;
        logNotificationInteraction(notifId, "tapped", {
            type: response.notification.request.content.data?.type,
        });

        appendNotificationToInbox(response.notification)
            .then(() => {
                if (notifId) {
                    return markInboxNotificationRead(String(notifId));
                }
                return loadNotificationInbox();
            })
            .then(setInbox)
            .catch(() => null);

        const nav = extractNavigationFromResponse(response);
        if (!nav) return;

        navigateTo(nav);
    }

    async function handleInitialNotificationResponse() {
        const response =
            await Notifications.getLastNotificationResponseAsync();
        if (response) {
            handleNotificationResponse(response);
        }
    }

    // ── Navigation helper ─────────────────────────────────────────────────────

    /**
     * Navigate to a screen from a notification tap.
     * Delays slightly to ensure the navigator is mounted.
     */
    function navigateTo(target) {
        if (!target?.screen) return;
        const normalized = normalizeNavigateTarget(target) ?? target;
        pendingNavRef.current = normalized;
    }

    // Ref so the NavConsumer component can fire pending nav
    const pendingNavRef = useRef(null);

    // ── Permission flow ───────────────────────────────────────────────────────

    const requestPermissions = useCallback(async () => {
        const status = await requestNotificationPermissions();
        setPermissionStatus(status);
        setShowPermissionScreen(false);

        if (status === "granted") {
            const prefs = await loadPreferences(profile);
            setPreferences(prefs);
            await refreshDailySchedule(prefs);
        }

        return status;
    }, [profile]);

    const dismissPermissionScreen = useCallback(() => {
        setShowPermissionScreen(false);
    }, []);

    // ── Preferences management ────────────────────────────────────────────────

    const updatePreferences = useCallback(
        async (updates) => {
            const newPrefs = { ...preferences, ...updates };
            setPreferences(newPrefs);
            await savePreferences(newPrefs);

            if (permissionStatus === "granted") {
                await refreshDailySchedule(newPrefs);
            }
        },
        [preferences, permissionStatus],
    );

    // ── Daily schedule refresh ────────────────────────────────────────────────

    const refreshDailySchedule = useCallback(
        async (prefs = null) => {
            if (schedulingRef.current) return;
            schedulingRef.current = true;

            try {
                const currentPrefs = prefs ?? preferences;
                if (!currentPrefs.enabled) return;

                const content = await generateNotificationContent(profile, "all");
                if (content) {
                    await scheduleDailyNotifications(currentPrefs, content);
                }
            } catch (err) {
                console.warn("[Notifications] Schedule refresh failed:", err);
            } finally {
                schedulingRef.current = false;
            }
        },
        [profile, preferences],
    );

    // ── Dynamic notifications ─────────────────────────────────────────────────

    /**
     * Triggers a smart contextual notification if throttle rules allow.
     * Called by screens that discover relevant recommendations/events.
     */
    const triggerDynamicNotification = useCallback(
        async (content) => {
            if (permissionStatus !== "granted") return;
            await sendDynamicNotification(content, preferences);
        },
        [permissionStatus, preferences],
    );

    const refreshInbox = useCallback(async () => {
        try {
            const list = await mergePresentedNotificationsIntoInbox();
            setInbox(list);
        } catch {
            const list = await loadNotificationInbox();
            setInbox(list);
        }
    }, []);

    const markAllInboxRead = useCallback(async () => {
        const list = await markAllInboxNotificationsRead();
        setInbox(list);
    }, []);

    const markInboxEntryRead = useCallback(async (id) => {
        const list = await markInboxNotificationRead(id);
        setInbox(list);
    }, []);

    // ── Context value ─────────────────────────────────────────────────────────

    const value = {
        permissionStatus,
        preferences,
        showPermissionScreen,
        isInitialized,
        pendingNavRef,
        requestPermissions,
        dismissPermissionScreen,
        updatePreferences,
        refreshDailySchedule,
        triggerDynamicNotification,
        inbox,
        inboxUnreadCount,
        refreshInbox,
        markAllInboxRead,
        markInboxEntryRead,
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
            {/* NavConsumer fires pending navigations after mount */}
            <NavConsumer pendingNavRef={pendingNavRef} />
        </NotificationContext.Provider>
    );
}

/**
 * Inner component that lives inside NavigationContainer and fires
 * any pending deep-link navigation queued before navigation was ready.
 * Must be rendered inside NavigationContainer (guaranteed by App.js layout).
 */
function NavConsumer({ pendingNavRef }) {
    // useNavigation() is safe here because NotificationProvider is rendered
    // inside NavigationContainer (see App.js InnerApp component).
    const navigation = useNavigation();

    useEffect(() => {
        const pending = pendingNavRef.current;
        if (!pending) return;
        pendingNavRef.current = null;

        // Delay allows the navigator to fully mount before navigating
        const timer = setTimeout(() => {
            try {
                const TAB_SCREENS = [
                    "Home",
                    "Discover",
                    "YourSchedule",
                    "Events",
                    "Profile",
                ];
                const normalized =
                    normalizeNavigateTarget(pending) ?? pending;
                if (TAB_SCREENS.includes(normalized.screen)) {
                    navigation.navigate("MainTabs", {
                        screen: normalized.screen,
                        params: normalized.params ?? {},
                    });
                } else {
                    navigation.navigate(
                        normalized.screen,
                        normalized.params ?? {},
                    );
                }
            } catch (e) {
                console.warn("[Notifications] Navigation from notification failed:", e.message);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, []);

    return null;
}
