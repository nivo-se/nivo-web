/**
 * Unified Proxy Integration
 * 
 * Supports both Oxylabs and ProxyScrape proxies
 * Automatically uses the enabled provider
 */

import { initOxylabsIntegration, fetchWithOxylabsProxy, getProxyStatus as getOxylabsStatus } from './oxylabs-integration';
import { initProxyScrapeIntegration, fetchWithProxyScrapeProxy, getProxyScrapeStatsForMonitoring } from './proxyscrape-integration';
import { loadOxylabsConfig } from './oxylabs-config';
import { loadProxyScrapeConfig } from './proxyscrape-config';

type ProxyProvider = 'oxylabs' | 'proxyscrape' | 'none';

let activeProvider: ProxyProvider = 'none';

/**
 * Initialize proxy based on environment variables
 * Priority: ProxyScrape > Oxylabs
 */
export async function initUnifiedProxy(): Promise<void> {
  const proxyscrapeConfig = loadProxyScrapeConfig();
  const oxylabsConfig = loadOxylabsConfig();

  // Check ProxyScrape first
  if (proxyscrapeConfig && proxyscrapeConfig.enabled) {
    console.log('🔧 Initializing ProxyScrape proxy...');
    await initProxyScrapeIntegration();
    activeProvider = 'proxyscrape';
    console.log('✅ Using ProxyScrape as proxy provider');
    return;
  }

  // Fall back to Oxylabs
  if (oxylabsConfig && oxylabsConfig.enabled) {
    console.log('🔧 Initializing Oxylabs proxy...');
    await initOxylabsIntegration();
    activeProvider = 'oxylabs';
    console.log('✅ Using Oxylabs as proxy provider');
    return;
  }

  // No proxy enabled
  activeProvider = 'none';
  console.warn('⚠️  No proxy provider enabled. Set PROXYSCRAPE_ENABLED=true or OXYLABS_ENABLED=true');
}

/**
 * Get active proxy provider
 */
export function getActiveProvider(): ProxyProvider {
  return activeProvider;
}

/**
 * Make request through active proxy provider
 */
export async function fetchWithProxy(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Check if provider changed (e.g., via environment variable reload)
  const proxyscrapeConfig = loadProxyScrapeConfig();
  const oxylabsConfig = loadOxylabsConfig();

  if (proxyscrapeConfig && proxyscrapeConfig.enabled) {
    if (activeProvider !== 'proxyscrape') {
      console.log('🔄 Switching to ProxyScrape proxy...');
      await initProxyScrapeIntegration();
      activeProvider = 'proxyscrape';
    }
    return await fetchWithProxyScrapeProxy(url, options);
  }

  if (oxylabsConfig && oxylabsConfig.enabled) {
    if (activeProvider !== 'oxylabs') {
      console.log('🔄 Switching to Oxylabs proxy...');
      await initOxylabsIntegration();
      activeProvider = 'oxylabs';
    }
    return await fetchWithOxylabsProxy(url, options);
  }

  throw new Error('No proxy provider enabled. Set PROXYSCRAPE_ENABLED=true or OXYLABS_ENABLED=true');
}

/**
 * Get proxy status
 */
export function getProxyStatus() {
  if (activeProvider === 'proxyscrape') {
    const stats = getProxyScrapeStatsForMonitoring();
    return {
      provider: 'proxyscrape',
      enabled: true,
      status: 'active',
      stats: stats ? {
        totalRequests: stats.totalRequests,
        successfulRequests: stats.successfulRequests,
        failedRequests: stats.failedRequests,
        successRate: stats.totalRequests > 0 
          ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
        estimatedDataUsage: `${stats.dataUsage.toFixed(2)} MB`,
        lastRequestTime: stats.lastRequestTime
      } : null
    };
  }

  if (activeProvider === 'oxylabs') {
    return {
      ...getOxylabsStatus(),
      provider: 'oxylabs'
    };
  }

  return {
    provider: 'none',
    enabled: false,
    status: 'disabled'
  };
}

