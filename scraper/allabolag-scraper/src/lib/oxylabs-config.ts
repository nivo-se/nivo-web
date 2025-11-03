/**
 * Oxylabs Configuration
 * 
 * Load and validate Oxylabs proxy configuration from environment variables
 */

import type { OxylabsConfig } from './oxylabs-proxy';

/**
 * Load Oxylabs configuration from environment variables
 */
export function loadOxylabsConfig(): OxylabsConfig | null {
  const enabled = process.env.OXYLABS_ENABLED === 'true';
  
  if (!enabled) {
    return null;
  }

  const username = process.env.OXYLABS_USERNAME;
  const password = process.env.OXYLABS_PASSWORD;

  if (!username || !password) {
    console.warn('⚠️  Oxylabs enabled but credentials missing. Set OXYLABS_USERNAME and OXYLABS_PASSWORD');
    return null;
  }

  const config: OxylabsConfig = {
    enabled: true,
    username,
    password,
    proxyType: (process.env.OXYLABS_PROXY_TYPE as 'residential' | 'isp' | 'datacenter') || 'datacenter',
    country: process.env.OXYLABS_COUNTRY || undefined, // e.g., 'se' for Sweden, 'us' for US
    sessionType: (process.env.OXYLABS_SESSION_TYPE as 'rotate' | 'sticky') || 'rotate',
    port: parseInt(process.env.OXYLABS_PORT || '8000', 10), // Default 8000 for datacenter
    countryInUsername: process.env.OXYLABS_COUNTRY_IN_USERNAME === 'true' // If true, country in username format
  };

  return config;
}

/**
 * Default Oxylabs configuration
 */
export const defaultOxylabsConfig: OxylabsConfig = {
  enabled: false,
  username: '',
  password: '',
  proxyType: 'datacenter',
  country: 'se', // Sweden
  sessionType: 'rotate',
  port: 8000,
  countryInUsername: true // Country targeting in username format
};

