import { useEffect, useMemo, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Loader from "../components/Loader";
import { createRoutine, deleteRoutine, getRoutines } from "../api/routineApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

const WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

const TIME_OF_DAY = ["morning", "afternoon", "evening"];

const ACTIVITY_TYPES = [
    "gym",
    "coffee",
    "reading",
    "hiking",
    "shopping",
    "restaurant",
    "study",
    "work",
    "walk",
    "yoga",
    "cinema",
    "social",
];

const LOCATION_PREF = ["indoor", "outdoor", "any"];

const BUDGET_RANGES = ["low", "medium", "high"];

const DEFAULT_DRAFT = {
    weekday: "monday",
    timeOfDay: "morning",
    activityType: "gym",
    locationPreference: "any",
    budgetRange: "medium",
};

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

function FieldRow({ label, valueLabel, onPress, styles, chevronColor }) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.fieldRow,
                pressed && styles.fieldRowPressed,
            ]}
        >
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.fieldRowRight}>
                <Text style={styles.fieldValue}>{valueLabel}</Text>
                <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={chevronColor}
                />
            </View>
        </Pressable>
    );
}

export default function RoutineBuilderScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(
        () => createStyles(palette),
        [palette],
    );

    const [routines, setRoutines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [modalVisible, setModalVisible] = useState(false);
    const [draft, setDraft] = useState(DEFAULT_DRAFT);
    const [picker, setPicker] = useState(null);

    useEffect(() => {
        let mounted = true;

        async function loadRoutines() {
            try {
                setLoading(true);
                setError("");
                const envelope = await getRoutines();
                const items = unwrapApiData(envelope, []);
                if (mounted) {
                    setRoutines(Array.isArray(items) ? items : []);
                }
            } catch (err) {
                if (mounted) {
                    setError(
                        getApiErrorMessage(err, "Unable to load routines."),
                    );
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }

        loadRoutines();

        return () => {
            mounted = false;
        };
    }, []);

    function openModal() {
        setDraft({ ...DEFAULT_DRAFT });
        setPicker(null);
        setModalVisible(true);
    }

    function closeModal() {
        setModalVisible(false);
        setPicker(null);
    }

    async function submitRoutine() {
        if (saving) {
            return;
        }

        try {
            setSaving(true);
            setError("");
            const envelope = await createRoutine(draft);
            const created = unwrapApiData(envelope, null);
            if (created) {
                setRoutines((current) => [created, ...current]);
            }
            closeModal();
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to create routine."));
        } finally {
            setSaving(false);
        }
    }

    async function removeRoutine(id) {
        try {
            setError("");
            await deleteRoutine(id);
            setRoutines((current) => current.filter((item) => item.id !== id));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to delete routine."));
        }
    }

    function renderPickerOptions() {
        const map = {
            weekday: WEEKDAYS,
            timeOfDay: TIME_OF_DAY,
            activityType: ACTIVITY_TYPES,
            locationPreference: LOCATION_PREF,
            budgetRange: BUDGET_RANGES,
        };
        const list = map[picker] ?? [];
        const titles = {
            weekday: "Day of week",
            timeOfDay: "Time of day",
            activityType: "Activity",
            locationPreference: "Place vibe",
            budgetRange: "Budget for this slot",
        };

        return (
            <View style={styles.pickerSheet}>
                <View style={styles.pickerHeader}>
                    <Pressable
                        onPress={() => setPicker(null)}
                        style={styles.pickerBack}
                    >
                        <Ionicons
                            name="arrow-back"
                            size={22}
                            color={palette.deepBlue}
                        />
                        <Text style={styles.pickerBackText}>Back</Text>
                    </Pressable>
                    <Text style={styles.pickerTitle}>{titles[picker]}</Text>
                </View>
                <ScrollView
                    style={styles.pickerScroll}
                    contentContainerStyle={styles.pickerScrollContent}
                >
                    {list.map((opt) => (
                        <Pressable
                            key={opt}
                            onPress={() => {
                                setDraft((d) => ({ ...d, [picker]: opt }));
                                setPicker(null);
                            }}
                            style={({ pressed }) => [
                                styles.pickerOption,
                                draft[picker] === opt &&
                                    styles.pickerOptionSelected,
                                pressed && styles.pickerOptionPressed,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.pickerOptionText,
                                    draft[picker] === opt &&
                                        styles.pickerOptionTextSelected,
                                ]}
                            >
                                {formatLabel(opt)}
                            </Text>
                            {draft[picker] === opt ? (
                                <Ionicons
                                    name="checkmark-circle"
                                    size={22}
                                    color={palette.emerald}
                                />
                            ) : null}
                        </Pressable>
                    ))}
                </ScrollView>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <Text style={styles.step}>Step 2 of 2</Text>
                <View style={styles.progressTrack}>
                    <View style={styles.progressFill} />
                </View>

                <Text style={styles.title}>Build your weekly routines</Text>
                <Text style={styles.subtitle}>
                    Add when you usually do things — we use it to time
                    suggestions well.
                </Text>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {loading ? <Loader /> : null}

                <ScrollView
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                >
                    {routines.map((routine) => (
                        <View key={routine.id} style={styles.card}>
                            <View>
                                <Text style={styles.cardTitle}>
                                    {formatLabel(routine.weekday)} •{" "}
                                    {formatLabel(routine.timeOfDay)}
                                </Text>
                                <Text style={styles.cardActivity}>
                                    {formatLabel(routine.activityType)}
                                </Text>
                                <Text style={styles.cardMeta}>
                                    {formatLabel(routine.locationPreference)} •{" "}
                                    {formatLabel(routine.budgetRange)}
                                </Text>
                            </View>
                            <Pressable
                                onPress={() => removeRoutine(routine.id)}
                            >
                                <Ionicons
                                    name="trash-outline"
                                    size={18}
                                    color={palette.deepBlue}
                                />
                            </Pressable>
                        </View>
                    ))}
                </ScrollView>

                <Pressable style={styles.fabWrap} onPress={openModal}>
                    <LinearGradient
                        colors={gradients.primaryButton}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.fab}
                    >
                        <Ionicons
                            name="add"
                            size={22}
                            color={palette.iceWhite}
                        />
                    </LinearGradient>
                </Pressable>

                <Pressable
                    style={styles.ctaWrap}
                    onPress={() => navigation.replace("MainTabs")}
                >
                    <LinearGradient
                        colors={gradients.primaryButtonMint}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cta}
                    >
                        <Text style={styles.ctaText}>
                            Save all & start exploring
                        </Text>
                        <Ionicons
                            name="arrow-forward"
                            size={16}
                            color={palette.iceWhite}
                        />
                    </LinearGradient>
                </Pressable>

                <Modal
                    visible={modalVisible}
                    animationType="slide"
                    transparent
                    onRequestClose={closeModal}
                >
                    <View style={styles.modalOverlay}>
                        <SafeAreaView style={styles.modalSafe}>
                            <View style={styles.modalCard}>
                                {!picker ? (
                                    <>
                                        <View style={styles.modalTopBar}>
                                            <Text style={styles.modalTitle}>
                                                New routine
                                            </Text>
                                            <Pressable
                                                onPress={closeModal}
                                                hitSlop={12}
                                            >
                                                <Ionicons
                                                    name="close"
                                                    size={26}
                                                    color={palette.textSecondary}
                                                />
                                            </Pressable>
                                        </View>
                                        <Text style={styles.modalHint}>
                                            Tap each row to choose — then add
                                            to your list.
                                        </Text>

                                        <FieldRow
                                            label="Day"
                                            valueLabel={formatLabel(
                                                draft.weekday,
                                            )}
                                            onPress={() =>
                                                setPicker("weekday")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Time"
                                            valueLabel={formatLabel(
                                                draft.timeOfDay,
                                            )}
                                            onPress={() =>
                                                setPicker("timeOfDay")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Activity"
                                            valueLabel={formatLabel(
                                                draft.activityType,
                                            )}
                                            onPress={() =>
                                                setPicker("activityType")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Place vibe"
                                            valueLabel={formatLabel(
                                                draft.locationPreference,
                                            )}
                                            onPress={() =>
                                                setPicker(
                                                    "locationPreference",
                                                )
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />
                                        <FieldRow
                                            label="Budget"
                                            valueLabel={formatLabel(
                                                draft.budgetRange,
                                            )}
                                            onPress={() =>
                                                setPicker("budgetRange")
                                            }
                                            styles={styles}
                                            chevronColor={palette.textMuted}
                                        />

                                        <Pressable
                                            onPress={submitRoutine}
                                            disabled={saving}
                                            style={[
                                                styles.modalAddWrap,
                                                saving &&
                                                    styles.modalAddDisabled,
                                            ]}
                                        >
                                            <LinearGradient
                                                colors={gradients.primaryButton}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={styles.modalAddBtn}
                                            >
                                                <Text style={styles.modalAddText}>
                                                    {saving
                                                        ? "Adding…"
                                                        : "Add routine"}
                                                </Text>
                                            </LinearGradient>
                                        </Pressable>
                                    </>
                                ) : (
                                    renderPickerOptions()
                                )}
                            </View>
                        </SafeAreaView>
                    </View>
                </Modal>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: palette.pageTop,
        },
        screen: {
            flex: 1,
            paddingHorizontal: 20,
            paddingTop: 8,
        },
        step: {
            color: palette.textMuted,
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontWeight: "800",
        },
        progressTrack: {
            marginTop: 8,
            height: 4,
            borderRadius: 999,
            backgroundColor: "rgba(10, 108, 168, 0.2)",
            overflow: "hidden",
        },
        progressFill: {
            width: "100%",
            height: "100%",
            backgroundColor: palette.oceanBlue,
        },
        title: {
            marginTop: 18,
            color: palette.textPrimary,
            fontSize: 42,
            lineHeight: 45,
            fontWeight: "800",
        },
        subtitle: {
            marginTop: 10,
            color: palette.textSecondary,
            fontSize: 15,
            lineHeight: 22,
        },
        errorText: {
            marginTop: 10,
            color: palette.danger,
            fontSize: 12,
        },
        list: {
            marginTop: 16,
        },
        listContent: {
            paddingBottom: 120,
            gap: 10,
        },
        card: {
            borderRadius: 18,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        cardTitle: {
            color: palette.textMuted,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: "700",
        },
        cardActivity: {
            marginTop: 6,
            color: palette.oceanBlue,
            fontSize: 18,
            fontWeight: "800",
        },
        cardMeta: {
            marginTop: 4,
            color: palette.textSecondary,
            fontSize: 12,
        },
        fabWrap: {
            position: "absolute",
            right: 20,
            bottom: 94,
            borderRadius: 25,
            overflow: "hidden",
        },
        fab: {
            width: 50,
            height: 50,
            borderRadius: 25,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2A9DE5",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.34,
            shadowRadius: 14,
            elevation: 6,
        },
        ctaWrap: {
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 24,
            borderRadius: 16,
            overflow: "hidden",
        },
        cta: {
            height: 54,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            shadowColor: "#2DAAFF",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 14,
            elevation: 7,
        },
        ctaText: {
            color: palette.iceWhite,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.3,
        },
        modalOverlay: {
            flex: 1,
            backgroundColor: "rgba(6, 22, 40, 0.45)",
            justifyContent: "flex-end",
        },
        modalSafe: {
            maxHeight: "92%",
        },
        modalCard: {
            backgroundColor: palette.pageTop,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 18,
            paddingBottom: 20,
            borderWidth: 1,
            borderColor: palette.borderSoft,
        },
        modalTopBar: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 16,
            paddingBottom: 8,
        },
        modalTitle: {
            color: palette.textPrimary,
            fontSize: 20,
            fontWeight: "800",
        },
        modalHint: {
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 19,
            marginBottom: 12,
        },
        fieldRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
            paddingHorizontal: 4,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: palette.borderSoft,
        },
        fieldRowPressed: {
            opacity: 0.75,
        },
        fieldLabel: {
            color: palette.textMuted,
            fontSize: 12,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.6,
        },
        fieldRowRight: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
        },
        fieldValue: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "700",
        },
        modalAddWrap: {
            marginTop: 18,
            borderRadius: 16,
            overflow: "hidden",
        },
        modalAddDisabled: {
            opacity: 0.55,
        },
        modalAddBtn: {
            height: 52,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
        },
        modalAddText: {
            color: palette.iceWhite,
            fontWeight: "800",
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: 0.4,
        },
        pickerSheet: {
            paddingTop: 8,
            minHeight: 360,
        },
        pickerHeader: {
            marginBottom: 8,
        },
        pickerBack: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 8,
        },
        pickerBackText: {
            color: palette.deepBlue,
            fontSize: 16,
            fontWeight: "700",
        },
        pickerTitle: {
            marginTop: 6,
            color: palette.textPrimary,
            fontSize: 18,
            fontWeight: "800",
        },
        pickerScroll: {
            maxHeight: 420,
        },
        pickerScrollContent: {
            paddingBottom: 24,
            gap: 6,
        },
        pickerOption: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
        },
        pickerOptionSelected: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.12)",
        },
        pickerOptionPressed: {
            opacity: 0.85,
        },
        pickerOptionText: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "600",
        },
        pickerOptionTextSelected: {
            color: palette.deepBlue,
            fontWeight: "800",
        },
    });
}
