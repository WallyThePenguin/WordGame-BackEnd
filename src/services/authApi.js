class ApiError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ApiError';
    }
}

class AuthApi {
    constructor() {
        this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
        this.accessToken = null;
        this.refreshToken = null;
        this.refreshPromise = null;

        if (typeof window !== 'undefined') {
            this.accessToken = localStorage.getItem('accessToken');
            this.refreshToken = localStorage.getItem('refreshToken');
        }
    }

    setTokens(accessToken, refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
        }
    }

    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        if (typeof window !== 'undefined') {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
        }
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }

        try {
            console.log('Making request to:', url, 'with options:', { ...options, headers: { ...headers, Authorization: '***' } });

            const response = await fetch(url, {
                ...options,
                headers,
            });

            console.log('Response status:', response.status);

            if (response.status === 401 && this.refreshToken) {
                // Token expired, try to refresh
                if (!this.refreshPromise) {
                    this.refreshPromise = this.refreshTokens();
                }
                await this.refreshPromise;
                this.refreshPromise = null;

                // Retry the original request with new token
                headers.Authorization = `Bearer ${this.accessToken}`;
                const retryResponse = await fetch(url, {
                    ...options,
                    headers,
                });

                if (!retryResponse.ok) {
                    const errorData = await retryResponse.json().catch(() => ({}));
                    throw new ApiError(errorData.error || 'Authentication failed');
                }

                return retryResponse.json();
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new ApiError(errorData.error || 'Request failed');
            }

            const data = await response.json();
            if (!data) {
                throw new ApiError('No data received from server');
            }
            return data;
        } catch (error) {
            console.error('Request error:', error);
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(error.message || 'Network error');
        }
    }

    async refreshTokens() {
        try {
            const response = await fetch(`${this.baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken: this.refreshToken }),
            });

            if (!response.ok) {
                throw new Error('Failed to refresh token');
            }

            const { accessToken, refreshToken } = await response.json();
            this.setTokens(accessToken, refreshToken);
        } catch (error) {
            this.clearTokens();
            throw new ApiError('Session expired');
        }
    }

    async login(email, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        if (!response.user || !response.accessToken || !response.refreshToken) {
            throw new ApiError('Invalid response from server');
        }

        this.setTokens(response.accessToken, response.refreshToken);
        return response.user;
    }

    async register(username, email, password) {
        const response = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
        });

        if (!response.user || !response.accessToken || !response.refreshToken) {
            throw new ApiError('Invalid response from server');
        }

        this.setTokens(response.accessToken, response.refreshToken);
        return response.user;
    }

    async logout() {
        this.clearTokens();
    }

    async getCurrentUser() {
        return this.request('/auth/me');
    }
}

export const authApi = new AuthApi();
export { ApiError }; 