/**
 * Oxylabs Integration with Scraper
 * 
 * Integrates Oxylabs proxy into the scraping request flow
 */

import { initializeOxylabs, getOxylabsProxy, fetchWithOxylabs, getOxylabsStats } from './oxylabs-proxy';
import { loadOxylabsConfig } from './oxylabs-config';

/**
 * Initialize Oxylabs proxy at startup
 * 
 * IMPORTANT: If OXYLABS_ENABLED=true, proxy is REQUIRED
 * Will throw error if proxy cannot be initialized
 */
export async function initOxylabsIntegration(): Promise<void> {
  const config = loadOxylabsConfig();
  
  if (!config) {
    // Proxy not enabled - that's fine
    console.log('ℹ️  Oxylabs proxy not enabled (OXYLABS_ENABLED=false)');
    return;
  }

  // Proxy is enabled - must initialize successfully
  try {
    const proxy = initializeOxylabs(config);
    console.log(`✅ Oxylabs ${config.proxyType} proxy initialized`);
    console.log(`   Country: ${config.country || 'any'}`);
    console.log(`   Session: ${config.sessionType}`);
    console.log(`   Proxy URL: ${proxy.getProxyUrl()}`);
  } catch (error) {
    console.error('❌ Failed to initialize Oxylabs proxy:', error);
    throw new Error(`Oxylabs proxy is required but failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your OXYLABS_USERNAME and OXYLABS_PASSWORD.`);
  }
}

/**
 * Wrap fetch request with Oxylabs proxy
 * 
 * IMPORTANT: No fallback to regular fetch - proxy is required
 * If proxy fails, throws error to stop scraping job
 * Job can be resumed once proxy is working again
 */
export async function fetchWithOxylabsProxy(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const proxy = getOxylabsProxy();
  
  if (!proxy) {
    // Check if proxy should be enabled
    const config = loadOxylabsConfig();
    if (config && config.enabled) {
      throw new Error('Oxylabs proxy is required but not initialized. Please check your OXYLABS_ENABLED and credentials. Scraping stopped.');
    }
    // Proxy not enabled - this shouldn't happen if we're here, but allow it
    throw new Error('Oxylabs proxy not initialized. Please enable OXYLABS_ENABLED=true and provide credentials. Scraping stopped.');
  }

  // Use Oxylabs proxy - retry on transient errors, fail on auth errors
  try {
    return await fetchWithOxylabs(url, options);
  } catch (error: any) {
    console.error('❌ Oxylabs proxy request failed:', error);
    
    // On 407 (Proxy Auth Required) - stop immediately, credentials are wrong
    if (error.message?.includes('407') || error.status === 407) {
      throw new Error('Oxylabs proxy authentication failed (407). Please check your OXYLABS_USERNAME and OXYLABS_PASSWORD. Scraping stopped. Fix credentials and resume job.');
    }
    
    // On 502 (Bad Gateway) or 525 (No Exit Found) - retry once, then fail
    if (error.message?.includes('502') || error.message?.includes('525') || error.status === 502 || error.status === 525) {
      console.log('🔄 Retrying with Oxylabs proxy after transient error...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        return await fetchWithOxylabs(url, options);
      } catch (retryError: any) {
        throw new Error(`Oxylabs proxy failed after retry: ${retryError.message}. Scraping stopped. Check proxy status and resume job once proxy is working.`);
      }
    }
    
    // For other errors, fail immediately
    throw new Error(`Oxylabs proxy error: ${error.message}. Scraping stopped. Fix proxy issue and resume job.`);
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

