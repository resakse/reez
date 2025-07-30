import AuthService from './auth';

interface PacsConfig {
  orthancurl: string;
}

let cachedPacsConfig: PacsConfig | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches the current PACS configuration from the backend database
 * Uses caching to avoid frequent API calls
 */
export async function getPacsConfig(): Promise<PacsConfig> {
  const now = Date.now();
  
  // Return cached config if still valid
  if (cachedPacsConfig && now < cacheExpiry) {
    return cachedPacsConfig;
  }
  
  try {
    const response = await AuthService.authenticatedFetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/orthanc-url/`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PACS config: ${response.statusText}`);
    }
    
    const config: PacsConfig = await response.json();
    
    // Cache the config
    cachedPacsConfig = config;
    cacheExpiry = now + CACHE_DURATION;
    
    return config;
  } catch (error) {
    // Failed to fetch PACS config from database, using fallback
    
    // Fallback to environment variable or default
    const fallbackConfig: PacsConfig = {
      orthancurl: process.env.NEXT_PUBLIC_ORTHANC_URL || 'http://localhost:8043'
    };
    
    return fallbackConfig;
  }
}

/**
 * Gets the Orthanc URL from PACS configuration
 */
export async function getOrthancUrl(): Promise<string> {
  const config = await getPacsConfig();
  return config.orthancurl;
}

/**
 * Clears the cached PACS configuration
 * Useful when PACS settings are updated
 */
export function clearPacsConfigCache(): void {
  cachedPacsConfig = null;
  cacheExpiry = 0;
}