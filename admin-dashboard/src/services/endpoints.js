import { apiClient } from "@/services/apiClient";

export const endpoints = {
	health: "/health",
	metrics: "/health/metrics",
	profile: "/profile",
	recommendations: "/recommendations",
	interactions: "/interactions",
	routines: "/routines",
	experiments: "/dev/experiment-metrics",
	devUser: "/dev/user",
	devInteractions: "/dev/interactions",
};

export async function getHealth() {
	const response = await apiClient.get(endpoints.health);
	return response.data;
}

export async function getMetrics() {
	const response = await apiClient.get(endpoints.metrics);
	return response.data;
}

export async function getUserProfile({ uid, email } = {}) {
	if (uid || email) {
		if (!import.meta.env.DEV) {
			throw new Error("User lookup by uid/email is only available in development mode");
		}
		const response = await apiClient.get(endpoints.devUser, {
			params: { uid, email },
		});
		return response.data;
	}

	const response = await apiClient.get(endpoints.profile);
	return response.data;
}

export async function getRecommendations(params) {
	const response = await apiClient.get(endpoints.recommendations, { params });
	return response.data;
}

export async function getInteractions({ uid, email, limit } = {}) {
	if (uid || email) {
		if (!import.meta.env.DEV) {
			throw new Error("Interactions lookup by uid/email is only available in development mode");
		}
		const response = await apiClient.get(endpoints.devInteractions, {
			params: { uid, email, limit },
		});
		return response.data;
	}
	const response = await apiClient.get(endpoints.interactions);
	return response.data;
}

export async function getRoutines() {
	const response = await apiClient.get(endpoints.routines);
	return response.data;
}

export async function getExperimentMetrics() {
	const response = await apiClient.get(endpoints.experiments);
	return response.data;
}
