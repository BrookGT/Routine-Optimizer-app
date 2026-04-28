/**
 * Build today's schedule rows for UI + navigation payloads (activity picks).
 */

export const WEEKDAY_KEYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];

const TIME_OF_DAY_ORDER = { morning: 0, afternoon: 1, evening: 2 };

export const SCHEDULE_ICON_BG = [
    "#14B8A6",
    "#8B5CF6",
    "#F472B6",
    "#FB923C",
    "#38BDF8",
    "#A3E635",
];

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "";
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseHHmm(str) {
    if (!str || typeof str !== "string" || !str.includes(":")) {
        return { h: 7, m: 0 };
    }
    const [a, b] = str.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(a) || Number.isNaN(b)) {
        return { h: 7, m: 0 };
    }
    return { h: a, m: b };
}

function minutesToHHmm(total) {
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function iconForActivityType(type) {
    const t = (type || "").toLowerCase();
    const map = {
        gym: "barbell-outline",
        coffee: "cafe",
        reading: "book",
        hiking: "map-outline",
        shopping: "bag",
        restaurant: "restaurant",
        study: "school",
        work: "laptop-outline",
        walk: "location-outline",
        yoga: "body-outline",
        cinema: "film-outline",
        social: "people",
        default: "ellipse-outline",
    };
    return map[t] ?? map.default;
}

function displayTitleForRoutine(r) {
    const slot = (r.timeOfDay || "").toLowerCase();
    const act = (r.activityType || "").toLowerCase();
    if (slot === "morning" && act === "gym") {
        return "Morning workout";
    }
    if (slot === "morning" && (act === "work" || act === "study")) {
        return "Work focus";
    }
    if (
        slot === "afternoon" &&
        (act === "coffee" || act === "restaurant")
    ) {
        return "Lunch break";
    }
    if (slot === "evening" && act === "cinema") {
        return "Evening movie";
    }
    if (slot === "evening" && (act === "walk" || act === "hiking")) {
        return "Evening walk";
    }
    const slotWord =
        slot === "morning"
            ? "Morning"
            : slot === "afternoon"
              ? "Midday"
              : slot === "evening"
                ? "Evening"
                : "";
    const actLabel = formatLabel(r.activityType || "Activity");
    return slotWord ? `${slotWord} ${actLabel.toLowerCase()}` : actLabel;
}

function assignTimesForRoutines(sorted, wakeTimeStr) {
    const wake = parseHHmm(wakeTimeStr);
    const wakeM = wake.h * 60 + wake.m;
    let morningI = 0;
    let afternoonI = 0;
    let eveningI = 0;

    return sorted.map((r) => {
        const slot = (r.timeOfDay || "morning").toLowerCase();
        if (slot === "morning") {
            const t = wakeM + morningI * 90;
            morningI += 1;
            return minutesToHHmm(Math.min(t, 23 * 60 + 30));
        }
        if (slot === "afternoon") {
            const start = 12 * 60 + 30 + afternoonI * 60;
            afternoonI += 1;
            return minutesToHHmm(start);
        }
        if (slot === "evening") {
            const start = 18 * 60 + 30 + eveningI * 75;
            eveningI += 1;
            return minutesToHHmm(Math.min(start, 22 * 60 + 30));
        }
        return minutesToHHmm(wakeM);
    });
}

function buildScheduleFromRoutines(routines, profile, date) {
    const todayKey = WEEKDAY_KEYS[date.getDay()];
    const forToday = (Array.isArray(routines) ? routines : []).filter(
        (r) => (r.weekday || "").toLowerCase() === todayKey,
    );
    const sorted = [...forToday].sort((a, b) => {
        const ta = TIME_OF_DAY_ORDER[(a.timeOfDay || "").toLowerCase()] ?? 9;
        const tb = TIME_OF_DAY_ORDER[(b.timeOfDay || "").toLowerCase()] ?? 9;
        if (ta !== tb) {
            return ta - tb;
        }
        return (a.activityType || "").localeCompare(b.activityType || "");
    });

    const wake = profile?.wakeTime;
    const times = assignTimesForRoutines(sorted, wake);

    return sorted.map((r, i) => ({
        id: r.id || `r-${i}`,
        title: displayTitleForRoutine(r),
        timeLabel: times[i],
        icon: iconForActivityType(r.activityType),
        color: SCHEDULE_ICON_BG[i % SCHEDULE_ICON_BG.length],
        routine: r,
        activityType: (r.activityType || "social").toLowerCase(),
        timeOfDay: (r.timeOfDay || "morning").toLowerCase(),
        locationPreference: (r.locationPreference || "any").toLowerCase(),
        budgetRange: (r.budgetRange || "medium").toLowerCase(),
    }));
}

function buildFallbackSchedule(profile) {
    const wake = profile?.wakeTime || "07:00";
    const activities = Array.isArray(profile?.weeklyActivities)
        ? profile.weeklyActivities
        : [];
    const has = (x) => activities.includes(x);

    return [
        {
            id: "fb-1",
            title: has("gym") ? "Morning workout" : "Morning movement",
            timeLabel: wake,
            icon: has("gym") ? "barbell-outline" : "sunny-outline",
            color: SCHEDULE_ICON_BG[0],
            routine: null,
            activityType: has("gym") ? "gym" : "walk",
            timeOfDay: "morning",
            locationPreference: "outdoor",
            budgetRange: "low",
        },
        {
            id: "fb-2",
            title:
                has("study") || has("work")
                    ? "Work focus"
                    : "Deep work block",
            timeLabel: "09:00",
            icon: has("study") ? "school" : "laptop-outline",
            color: SCHEDULE_ICON_BG[1],
            routine: null,
            activityType: has("study") ? "study" : "work",
            timeOfDay: "morning",
            locationPreference: "indoor",
            budgetRange: "medium",
        },
        {
            id: "fb-3",
            title: "Lunch break",
            timeLabel: "13:00",
            icon: "cafe",
            color: SCHEDULE_ICON_BG[2],
            routine: null,
            activityType: "restaurant",
            timeOfDay: "afternoon",
            locationPreference: "any",
            budgetRange: "medium",
        },
        {
            id: "fb-4",
            title:
                has("social") || has("creative")
                    ? "Evening out"
                    : "Evening unwind",
            timeLabel: "19:00",
            icon: "moon",
            color: SCHEDULE_ICON_BG[3],
            routine: null,
            activityType: "social",
            timeOfDay: "evening",
            locationPreference: "any",
            budgetRange: "medium",
        },
    ];
}

/**
 * @returns {Array<object>} rows with title, timeLabel, icon, color, activityType, …
 */
export function getTodaysScheduleRows(routines, profile, date) {
    const p = profile ?? {};
    const fromRoutines = buildScheduleFromRoutines(routines, p, date);
    if (fromRoutines.length > 0) {
        return fromRoutines;
    }
    return buildFallbackSchedule(p);
}
