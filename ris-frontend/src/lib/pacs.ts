import AuthService from './auth';

interface PacsServer {
  id: number;
  name: string;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  is_active: boolean;
  is_primary: boolean;
  comments?: string;
}

interface PacsConfig {
  servers: PacsServer[];
  primary_server: PacsServer | null;
  active_servers: PacsServer[];
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
  
  if (cachedPacsConfig && now < cacheExpiry) {
    return cachedPacsConfig;
  }
  
  try {
    const [serversResponse, primaryResponse] = await Promise.all([
      AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/active/`),
      AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/primary/`)
    ]);
    
    const servers: PacsServer[] = serversResponse.ok ? await serversResponse.json() : [];
    const primary_server: PacsServer | null = primaryResponse.ok ? await primaryResponse.json() : null;
    
    const config: PacsConfig = {
      servers,
      primary_server,
      active_servers: servers.filter(s => s.is_active)
    };
    
    cachedPacsConfig = config;
    cacheExpiry = now + CACHE_DURATION;
    
    return config;
  } catch (error) {
    console.warn('Failed to fetch multiple PACS config, using fallback:', error);
    
    // Fallback to single server configuration for backward compatibility
    return {
      servers: [{
        id: 1,
        name: 'Default PACS',
        orthancurl: process.env.NEXT_PUBLIC_ORTHANC_URL || 'http://localhost:8043',
        viewrurl: 'http://localhost:3000/viewer',
        endpoint_style: 'dicomweb',
        is_active: true,
        is_primary: true
      }],
      primary_server: null,
      active_servers: []
    };
  }
}

/**
 * Gets the primary PACS server
 */
export async function getPrimaryPacsServer(): Promise<PacsServer | null> {
  const config = await getPacsConfig();
  return config.primary_server || config.servers.find(s => s.is_primary) || null;
}

/**
 * Gets all active PACS servers
 */
export async function getActivePacsServers(): Promise<PacsServer[]> {
  const config = await getPacsConfig();
  return config.active_servers;
}

/**
 * Gets a specific PACS server by ID
 */
export async function getPacsServerById(id: number): Promise<PacsServer | null> {
  const config = await getPacsConfig();
  return config.servers.find(s => s.id === id) || null;
}

/**
 * Gets the Orthanc URL from primary PACS server (backward compatibility)
 */
export async function getOrthancUrl(): Promise<string> {
  const primaryServer = await getPrimaryPacsServer();
  return primaryServer?.orthancurl || process.env.NEXT_PUBLIC_ORTHANC_URL || 'http://localhost:8043';
}

/**
 * Clears the cached PACS configuration
 * Useful when PACS settings are updated
 */
export function clearPacsConfigCache(): void {
  cachedPacsConfig = null;
  cacheExpiry = 0;
}

// Export types for use in other components
export type { PacsServer, PacsConfig };