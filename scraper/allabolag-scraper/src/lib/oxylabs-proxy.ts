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
  proxyType: 'residential' | 'isp';
  country?: string; // ISO country code (e.g., 'se' for Sweden)
  sessionType?: 'rotate' | 'sticky'; // IP rotation strategy
  port?: number;
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
      ...config
    };

    // Build proxy URL
    const host = this.config.proxyType === 'residential' 
      ? 'pr.oxylabs.io' 
      : 'isp.oxylabs.io';
    
    this.proxyUrl = `http://${this.config.username}:${this.config.password}@${host}:${this.config.port}`;
    
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
    if (!this.config.enabled) {
      // Fallback to regular fetch if proxy is disabled
      return fetch(url, options);
    }

    this.stats.totalRequests++;
    this.stats.lastRequestTime = new Date();

    try {
      // Build headers with Oxylabs-specific options
      const headers = new Headers(options.headers || {});
      
      // Add country targeting if specified
      if (this.config.country) {
        headers.set('X-Oxylabs-Country', this.config.country);
      }

      // Add session control if sticky sessions
      if (this.config.sessionType === 'sticky') {
        // Sticky sessions use session_id in URL or headers
        // For now, we'll use rotate (default) which gives new IP per request
      }

      // Make request through proxy
      const response = await fetch(url, {
        ...options,
        // @ts-ignore - Node.js fetch doesn't have agent in types, but it works
        agent: this.proxyAgent,
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
    const host = this.config.proxyType === 'residential' 
      ? 'pr.oxylabs.io' 
      : 'isp.oxylabs.io';
    return `http://${this.config.username}:***@${host}:${this.config.port}`;
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
  
  // Fallback to regular fetch if proxy not initialized
  console.warn('⚠️  Oxylabs proxy not initialized, using regular fetch');
  return fetch(url, options);
}

/**
 * Get Oxylabs statistics
 */
export function getOxylabsStats(): OxylabsStats | null {
  return oxylabsProxyInstance?.getStats() || null;
}

