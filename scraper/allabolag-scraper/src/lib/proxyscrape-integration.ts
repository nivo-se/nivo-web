/**
 * ProxyScrape Integration with Scraper
 * 
 * Integrates ProxyScrape proxy into the scraping request flow
 */

import { initializeProxyScrape, getProxyScrapeProxy, fetchWithProxyScrape, getProxyScrapeStats } from './proxyscrape-proxy';
import { loadProxyScrapeConfig } from './proxyscrape-config';

/**
 * Initialize ProxyScrape proxy at startup
 */
export async function initProxyScrapeIntegration(): Promise<void> {
  const config = loadProxyScrapeConfig();
  
  if (!config) {
    console.log('ℹ️  ProxyScrape proxy not enabled (PROXYSCRAPE_ENABLED=false)');
    return;
  }

  try {
    const proxy = initializeProxyScrape(config);
    console.log(`✅ ProxyScrape ${config.proxyType.toUpperCase()} proxy initialized`);
    console.log(`   Endpoint: ${config.endpoint}:${config.port}`);
    console.log(`   Proxy URL: ${proxy.getProxyUrl()}`);
  } catch (error) {
    console.error('❌ Failed to initialize ProxyScrape proxy:', error);
    throw new Error(`ProxyScrape proxy is required but failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your PROXYSCRAPE_USERNAME and PROXYSCRAPE_PASSWORD.`);
  }
}

/**
 * Wrap fetch request with ProxyScrape proxy
 */
export async function fetchWithProxyScrapeProxy(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let proxy = getProxyScrapeProxy();
  
  // Auto-initialize if not already initialized
  if (!proxy) {
    const config = loadProxyScrapeConfig();
    if (config && config.enabled) {
      console.log('🔄 Auto-initializing ProxyScrape proxy...');
      try {
        proxy = initializeProxyScrape(config);
        console.log(`✅ ProxyScrape ${config.proxyType.toUpperCase()} proxy auto-initialized`);
      } catch (error) {
        console.error('❌ Failed to auto-initialize ProxyScrape proxy:', error);
        throw new Error(`ProxyScrape proxy is required but failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your PROXYSCRAPE_USERNAME and PROXYSCRAPE_PASSWORD. Scraping stopped.`);
      }
    } else {
      throw new Error('ProxyScrape proxy not initialized. Please enable PROXYSCRAPE_ENABLED=true and provide credentials. Scraping stopped.');
    }
  }

  try {
    return await fetchWithProxyScrape(url, options);
  } catch (error: any) {
    console.error('❌ ProxyScrape proxy request failed:', error);
    
    // On 407 (Proxy Auth Required) - stop immediately
    if (error.message?.includes('407') || error.status === 407) {
      throw new Error('ProxyScrape proxy authentication failed (407). Please check your PROXYSCRAPE_USERNAME and PROXYSCRAPE_PASSWORD. Scraping stopped. Fix credentials and resume job.');
    }
    
    // On 429 (Rate Limit) - retry with next proxy if available
    if (error.message?.includes('429') || error.message?.includes('Too Many Requests') || error.status === 429) {
      throw new Error('ProxyScrape proxy rate limit (429). Please wait and resume job later.');
    }
    
    // For other errors, fail immediately
    throw new Error(`ProxyScrape proxy error: ${error.message}. Scraping stopped. Fix proxy issue and resume job.`);
  }
}

/**
 * Get ProxyScrape statistics for monitoring
 */
export function getProxyScrapeStatsForMonitoring() {
  return getProxyScrapeStats();
}

