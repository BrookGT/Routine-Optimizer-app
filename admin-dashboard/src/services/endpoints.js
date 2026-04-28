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
	devModel: "/dev/model",
	devSystem: "/dev/system",
	devSystemExperiment: "/dev/system/experiment",
	devSystemFallback: "/dev/system/fallback",
	devSeed: "/dev/seed",
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

export async function getModelStatus() {
	if (!import.meta.env.DEV) {
		throw new Error("Model status is only available in development mode");
	}
	const response = await apiClient.get(endpoints.devModel);
	return response.data;
}

export async function getSystemStatus() {
	if (!import.meta.env.DEV) {
		throw new Error("System controls are only available in development mode");
	}
	const response = await apiClient.get(endpoints.devSystem);
	return response.data;
}

export async function setExperimentActive(enabled) {
	if (!import.meta.env.DEV) {
		throw new Error("System controls are only available in development mode");
	}
	const response = await apiClient.post(endpoints.devSystemExperiment, { enabled });
	return response.data;
}

export async function setFallbackMode(enabled) {
	if (!import.meta.env.DEV) {
		throw new Error("System controls are only available in development mode");
	}
	const response = await apiClient.post(endpoints.devSystemFallback, { enabled });
	return response.data;
}

export async function runSeed() {
	if (!import.meta.env.DEV) {
		throw new Error("Seeding is only available in development mode");
	}
	const response = await apiClient.post(endpoints.devSeed);
	return response.data;
}
