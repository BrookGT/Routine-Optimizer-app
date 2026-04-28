import axios from "axios";

export const apiClient = axios.create({
	baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
	timeout: 10000,
});

function getAuthToken() {
	return (
		window.localStorage.getItem("firebaseToken") ||
		window.localStorage.getItem("adminToken") ||
		""
	);
}

apiClient.interceptors.request.use((config) => {
	const token = getAuthToken();
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

apiClient.interceptors.response.use(
	(response) => response,
	(error) => {
		const status = error?.response?.status;
		if (status === 401 || status === 403) {
			window.localStorage.removeItem("adminToken");
			window.localStorage.removeItem("firebaseToken");
			window.dispatchEvent(new Event("admin:logout"));
		}

		const message =
			error?.response?.data?.message ||
			error?.message ||
			"Request failed";
		return Promise.reject(new Error(message));
	}
);
