import apiClient from "./client";

export async function getProfile() {
    const { data } = await apiClient.get("/profile");
    return data;
}

export async function updateProfile(payload) {
    const { data } = await apiClient.put("/profile", payload);
    return data;
}
