/**
 * Oxylabs Integration with Scraper
 * 
 * Integrates Oxylabs proxy into the scraping request flow
 */

import { initializeOxylabs, getOxylabsProxy, fetchWithOxylabs, getOxylabsStats } from './oxylabs-proxy';
import { loadOxylabsConfig } from './oxylabs-config';

/**
 * Initialize Oxylabs proxy at startup
 */
export async function initOxylabsIntegration(): Promise<void> {
  try {
    const config = loadOxylabsConfig();
    if (config) {
      const proxy = initializeOxylabs(config);
      console.log(`✅ Oxylabs ${config.proxyType} proxy initialized`);
      console.log(`   Country: ${config.country || 'any'}`);
      console.log(`   Session: ${config.sessionType}`);
      console.log(`   Proxy URL: ${proxy.getProxyUrl()}`);
    }
  } catch (error) {
    console.error('Failed to initialize Oxylabs proxy:', error);
    // Don't throw - allow scraping to continue without proxy
    console.warn('⚠️  Continuing without Oxylabs proxy...');
  }
}

/**
 * Wrap fetch request with Oxylabs proxy
 */
export async function fetchWithOxylabsProxy(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const proxy = getOxylabsProxy();
  
  if (proxy) {
    // Use Oxylabs proxy
    try {
      return await fetchWithOxylabs(url, options);
    } catch (error: any) {
      console.error('Oxylabs proxy request failed:', error);
      
      // On 407 (Proxy Auth Required) or 502 (Bad Gateway), retry once
      if (error.message?.includes('407') || error.message?.includes('502')) {
        console.log('🔄 Retrying with Oxylabs proxy after error...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await fetchWithOxylabs(url, options);
      }
      
      throw error;
    }
  } else {
    // Fallback to regular fetch if proxy not enabled
    return fetch(url, options);
  }
}

/**
 * Get Oxylabs statistics for monitoring
 */
export function getOxylabsStatsForMonitoring() {
  return getOxylabsStats();
}

/**
 * Get proxy status
 */
export function getProxyStatus() {
  const proxy = getOxylabsProxy();
  if (!proxy) {
    return { enabled: false, status: 'disabled' };
  }

  const stats = proxy.getStats();
  return {
    enabled: true,
    status: 'active',
    stats: {
      totalRequests: stats.totalRequests,
      successfulRequests: stats.successfulRequests,
      failedRequests: stats.failedRequests,
      successRate: stats.totalRequests > 0 
        ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      estimatedDataUsage: `${stats.dataUsage.toFixed(2)} MB`,
      estimatedCost: `$${proxy.estimateCost().toFixed(2)}`,
      lastRequestTime: stats.lastRequestTime
    }
  };
}

