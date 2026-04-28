import apiClient from "./client";

export async function createInteraction(payload) {
    const { data } = await apiClient.post("/interactions", payload);
    return data;
}

export async function createInteractionsBatch(interactions) {
    const list = Array.isArray(interactions) ? interactions : [];
    const { data } = await apiClient.post("/interactions/batch", { items: list });
    return data;
}

export async function getInteractions() {
    const { data } = await apiClient.get("/interactions");
    return data;
}
