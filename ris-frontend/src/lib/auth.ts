import { jwtDecode } from 'jwt-decode';
import { CookieStorage } from './cookies';

interface AuthTokens {
  access: string;
  refresh: string;
}

interface DecodedToken {
  exp: number;
  iat: number;
  jti: string;
  user_id: number;
  username: string;
  // Add other fields as needed
}

class AuthService {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';

  static async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const tokens: AuthTokens = await response.json();
      this.setTokens(tokens);
      return true;
    } catch (error) {
      // Login error occurred
      return false;
    }
  }

  static logout() {
    CookieStorage.delete(this.ACCESS_TOKEN_KEY);
    CookieStorage.delete(this.REFRESH_TOKEN_KEY);
  }

  static getAccessToken(): string | null {
    return CookieStorage.get(this.ACCESS_TOKEN_KEY);
  }

  static getRefreshToken(): string | null {
    return CookieStorage.get(this.REFRESH_TOKEN_KEY);
  }

  static setTokens(tokens: AuthTokens) {
    CookieStorage.set(this.ACCESS_TOKEN_KEY, tokens.access, 1); // 1 day
    CookieStorage.set(this.REFRESH_TOKEN_KEY, tokens.refresh, 7); // 7 days
  }

  static isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;

    try {
      const decoded = jwtDecode<DecodedToken>(token);
      return decoded.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  static async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/token/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.setTokens({ access: data.access, refresh: refreshToken });
      return true;
    } catch (error) {
      // Token refresh error occurred
      this.logout();
      return false;
    }
  }

  static async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    let token = this.getAccessToken();
    
    if (!token) {
      throw new Error('No access token available');
    }

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    };

    let response = await fetch(url, { ...options, headers });

    // If token expired, try to refresh
    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        token = this.getAccessToken();
        headers.Authorization = `Bearer ${token}`;
        response = await fetch(url, { ...options, headers });
      }
    }

    return response;
  }

  static getCurrentUser() {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      return jwtDecode<DecodedToken>(token);
    } catch {
      return null;
    }
  }
}

export default AuthService;