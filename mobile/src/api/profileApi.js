import apiClient from "./client";

export async function getProfile() {
    const { data } = await apiClient.get("/profile");
    return data;
}

export async function updateProfile(payload) {
    const { data } = await apiClient.put("/profile", payload);
    return data;
}

/**
 * Checks whether a username is available (without writing).
 * Returns { available: boolean, reason?: string }
 */
export async function checkUsernameAvailability(username) {
    const { data } = await apiClient.get("/profile/username/check", {
        params: { username },
    });
    return data?.data ?? { available: false };
}
