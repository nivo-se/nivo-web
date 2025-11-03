/**
 * Oxylabs Proxy Integration
 * 
 * Handles proxy requests through Oxylabs residential/ISP proxies
 * Supports automatic IP rotation and country targeting
 */

import { HttpsProxyAgent } from 'https-proxy-agent';

export interface OxylabsConfig {
  enabled: boolean;
  username: string;
  password: string;
  proxyType: 'residential' | 'isp' | 'datacenter';
  country?: string; // ISO country code (e.g., 'se' for Sweden, 'us' for US)
  sessionType?: 'rotate' | 'sticky'; // IP rotation strategy
  port?: number;
  // Country targeting can be in username format: username-country-XX
  countryInUsername?: boolean; // If true, country is added to username
}

export interface OxylabsStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  dataUsage: number; // estimated in MB
  lastRequestTime: Date | null;
}

export class OxylabsProxy {
  private config: OxylabsConfig;
  private stats: OxylabsStats;
  private proxyAgent: HttpsProxyAgent | null = null;
  private proxyUrl: string;

  constructor(config: OxylabsConfig) {
    this.config = {
      port: 7777,
      sessionType: 'rotate',
      countryInUsername: false,
      ...config
    };

    // Build proxy URL based on proxy type
    let host: string;
    let port: number;
    
    if (this.config.proxyType === 'datacenter') {
      host = 'dc.oxylabs.io';
      port = this.config.port || 8000;
    } else if (this.config.proxyType === 'residential') {
      host = 'pr.oxylabs.io';
      port = this.config.port || 7777;
    } else {
      // ISP proxy
      host = 'isp.oxylabs.io';
      port = this.config.port || 7777;
    }

    // Build username with country targeting if needed
    let username = this.config.username;
    if (this.config.country && this.config.countryInUsername) {
      // Add country to username: username-country-XX
      username = `${username}-country-${this.config.country.toUpperCase()}`;
      console.log(`Using country targeting in username: ${username}`);
    }
    
    // URL encode username and password to handle special characters (like +)
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(this.config.password);
    
    this.proxyUrl = `http://${encodedUsername}:${encodedPassword}@${host}:${port}`;
    
    console.log(`Proxy URL (masked): http://${encodedUsername}:***@${host}:${port}`);
    console.log(`Password length: ${this.config.password.length}`);
    console.log(`Password contains special chars: ${/[+@#%&]/.test(this.config.password)}`);
    
    // Create proxy agent
    this.proxyAgent = new HttpsProxyAgent(this.proxyUrl);

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      dataUsage: 0,
      lastRequestTime: null
    };
  }

  /**
   * Make a request through Oxylabs proxy
   */
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    // CRITICAL: If proxy is enabled, it MUST be used - NO fallback
    if (!this.config.enabled) {
      throw new Error('Oxylabs proxy is disabled but required. Set OXYLABS_ENABLED=true and provide credentials. Scraping stopped.');
    }

    this.stats.totalRequests++;
    this.stats.lastRequestTime = new Date();

    try {
      // Build headers with Oxylabs-specific options
      const headers = new Headers(options.headers || {});
      
      // Add country targeting via header if NOT in username
      if (this.config.country && !this.config.countryInUsername) {
        headers.set('X-Oxylabs-Country', this.config.country);
      }

      // Add session control if sticky sessions
      if (this.config.sessionType === 'sticky') {
        // Sticky sessions use session_id in URL or headers
        // For now, we'll use rotate (default) which gives new IP per request
      }

      // Make request through proxy
      // Node.js native fetch() doesn't support 'agent' property
      // Use undici's fetch with dispatcher for proxy support
      const { fetch: undiciFetch, Agent: UndiciAgent } = await import('undici');
      
      // Create undici dispatcher with proxy URL
      const dispatcher = new UndiciAgent({
        connect: {
          proxy: this.proxyUrl,
        }
      });
      
      const response = await undiciFetch(url, {
        ...options,
        dispatcher: dispatcher,
        headers: headers
      });

      // Track success
      if (response.ok) {
        this.stats.successfulRequests++;
        
        // Estimate data usage (rough estimate)
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          this.stats.dataUsage += parseInt(contentLength, 10) / 1024 / 1024; // MB
        } else {
          // Rough estimate: 50KB per request
          this.stats.dataUsage += 0.05;
        }
      } else {
        this.stats.failedRequests++;
      }

      return response;
    } catch (error) {
      this.stats.failedRequests++;
      console.error('Oxylabs proxy request failed:', error);
      throw error;
    }
  }

  /**
   * Get proxy statistics
   */
  getStats(): OxylabsStats {
    return { ...this.stats };
  }

  /**
   * Get proxy URL (for debugging)
   */
  getProxyUrl(): string {
    // Return URL without password for security
    let host: string;
    let port: number;
    
    if (this.config.proxyType === 'datacenter') {
      host = 'dc.oxylabs.io';
      port = this.config.port || 8000;
    } else if (this.config.proxyType === 'residential') {
      host = 'pr.oxylabs.io';
      port = this.config.port || 7777;
    } else {
      host = 'isp.oxylabs.io';
      port = this.config.port || 7777;
    }
    
    let username = this.config.username;
    if (this.config.country && this.config.countryInUsername) {
      username = `${username}-country-${this.config.country.toUpperCase()}`;
    }
    
    return `http://${username}:***@${host}:${port}`;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      dataUsage: 0,
      lastRequestTime: null
    };
  }

  /**
   * Estimate cost (rough calculation)
   * Residential: ~$2-5 per GB
   * ISP: ~$1-3 per GB
   */
  estimateCost(): number {
    const gbUsed = this.stats.dataUsage / 1024;
    const costPerGB = this.config.proxyType === 'residential' ? 3.5 : 2.0;
    return gbUsed * costPerGB;
  }
}

/**
 * Global Oxylabs proxy instance
 */
let oxylabsProxyInstance: OxylabsProxy | null = null;

/**
 * Initialize Oxylabs proxy
 */
export function initializeOxylabs(config: OxylabsConfig): OxylabsProxy {
  oxylabsProxyInstance = new OxylabsProxy(config);
  console.log(`✅ Oxylabs ${config.proxyType} proxy initialized`);
  console.log(`   Country: ${config.country || 'any'}`);
  console.log(`   Session: ${config.sessionType || 'rotate'}`);
  return oxylabsProxyInstance;
}

/**
 * Get Oxylabs proxy instance
 */
export function getOxylabsProxy(): OxylabsProxy | null {
  return oxylabsProxyInstance;
}

/**
 * Make request through Oxylabs proxy
 */
export async function fetchWithOxylabs(url: string, options: RequestInit = {}): Promise<Response> {
  if (oxylabsProxyInstance) {
    return await oxylabsProxyInstance.fetch(url, options);
  }
  
  // CRITICAL: NO fallback - proxy is REQUIRED
  // If proxy is not initialized but OXYLABS_ENABLED=true, this is an error
  const config = await import('./oxylabs-config').then(m => m.loadOxylabsConfig());
  if (config && config.enabled) {
    throw new Error('Oxylabs proxy is required but not initialized. Please check your OXYLABS_USERNAME and OXYLABS_PASSWORD. Scraping stopped.');
  }
  
  // Only allow fallback if proxy is explicitly disabled
  throw new Error('Oxylabs proxy is required. Set OXYLABS_ENABLED=true and provide credentials. Scraping stopped.');
}

/**
 * Get Oxylabs statistics
 */
export function getOxylabsStats(): OxylabsStats | null {
  return oxylabsProxyInstance?.getStats() || null;
}

