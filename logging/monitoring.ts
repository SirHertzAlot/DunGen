import { EventEmitter } from 'events';
import { logger } from './logger';
import { auditLogger } from './audit';
import os from 'os';

/**
 * System monitoring and health check service
 * Tracks system metrics, performance, and health indicators
 */

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage_percent: number;
    heap_used: number;
    heap_total: number;
  };
  network: {
    connections: number;
    bytes_sent: number;
    bytes_received: number;
  };
  process: {
    pid: number;
    uptime: number;
    threads: number;
    handles: number;
  };
  application: {
    active_sessions: number;
    active_players: number;
    active_regions: number;
    events_per_second: number;
    database_connections: number;
    cache_hit_rate: number;
  };
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  response_time: number;
  last_check: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Alert {
  id: string;
  type: 'performance' | 'health' | 'security' | 'business';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  metric?: string;
  threshold?: number;
  current_value?: number;
  timestamp: Date;
  resolved?: boolean;
  resolved_at?: Date;
}

export interface MonitoringConfig {
  collection_interval: number;
  health_check_interval: number;
  alert_thresholds: {
    cpu_usage: number;
    memory_usage: number;
    response_time: number;
    error_rate: number;
    disk_usage: number;
  };
  retention_hours: number;
}

export class SystemMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private metrics: SystemMetrics[] = [];
  private healthChecks: Map<string, HealthCheck> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private isCollecting = false;
  private collectionInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastNetworkStats = { bytes_sent: 0, bytes_received: 0 };

  constructor(config?: Partial<MonitoringConfig>) {
    super();
    
    this.config = {
      collection_interval: parseInt(process.env.MONITORING_COLLECTION_INTERVAL || '30000'), // 30 seconds
      health_check_interval: parseInt(process.env.MONITORING_HEALTH_CHECK_INTERVAL || '60000'), // 1 minute
      alert_thresholds: {
        cpu_usage: 80,
        memory_usage: 85,
        response_time: 5000,
        error_rate: 5,
        disk_usage: 90
      },
      retention_hours: parseInt(process.env.MONITORING_RETENTION_HOURS || '168'), // 7 days
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      // Register health check services
      this.registerHealthChecks();
      
      // Start monitoring
      this.startCollection();
      this.startHealthChecks();
      
      this.isCollecting = true;
      
      logger.info('System monitor initialized', {
        collection_interval: this.config.collection_interval,
        health_check_interval: this.config.health_check_interval
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize system monitor', { error: error.message });
      throw error;
    }
  }

  private registerHealthChecks(): void {
    // Database health check
    this.registerHealthCheck('database', async () => {
      const start = Date.now();
      try {
        // This would ping the database
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate DB ping
        return {
          status: 'healthy' as const,
          response_time: Date.now() - start,
          metadata: { connections: 10 } // Would get actual connection count
        };
      } catch (error) {
        return {
          status: 'unhealthy' as const,
          response_time: Date.now() - start,
          error: error.message
        };
      }
    });

    // Cache health check
    this.registerHealthCheck('cache', async () => {
      const start = Date.now();
      try {
        // This would ping Redis
        await new Promise(resolve => setTimeout(resolve, 5)); // Simulate cache ping
        return {
          status: 'healthy' as const,
          response_time: Date.now() - start,
          metadata: { hit_rate: 0.85 }
        };
      } catch (error) {
        return {
          status: 'unhealthy' as const,
          response_time: Date.now() - start,
          error: error.message
        };
      }
    });

    // Event bus health check
    this.registerHealthCheck('event_bus', async () => {
      const start = Date.now();
      try {
        // This would check event bus connectivity
        return {
          status: 'healthy' as const,
          response_time: Date.now() - start,
          metadata: { subscriptions: 5 }
        };
      } catch (error) {
        return {
          status: 'unhealthy' as const,
          response_time: Date.now() - start,
          error: error.message
        };
      }
    });

    // Unity ECS health check
    this.registerHealthCheck('unity_ecs', async () => {
      const start = Date.now();
      try {
        // This would check Unity ECS server connectivity
        return {
          status: 'healthy' as const,
          response_time: Date.now() - start,
          metadata: { active_entities: 1000 }
        };
      } catch (error) {
        return {
          status: 'unhealthy' as const,
          response_time: Date.now() - start,
          error: error.message
        };
      }
    });
  }

  private registerHealthCheck(service: string, checker: () => Promise<Omit<HealthCheck, 'service' | 'last_check'>>): void {
    this.healthChecks.set(service, {
      service,
      status: 'healthy',
      response_time: 0,
      last_check: new Date()
    });
  }

  private startCollection(): void {
    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.collection_interval);

    // Collect initial metrics
    this.collectMetrics();
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.config.health_check_interval);

    // Run initial health checks
    this.runHealthChecks();
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.gatherSystemMetrics();
      this.metrics.push(metrics);
      this.pruneMetrics();
      
      // Check for alerts
      this.checkAlerts(metrics);
      
      this.emit('metrics_collected', metrics);
    } catch (error) {
      logger.error('Failed to collect metrics', { error: error.message });
    }
  }

  private async gatherSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    
    return {
      timestamp: new Date(),
      cpu: {
        usage: await this.getCPUUsage(),
        loadAverage: loadAvg,
        cores: os.cpus().length
      },
      memory: {
        total: os.totalmem(),
        used: os.totalmem() - os.freemem(),
        free: os.freemem(),
        usage_percent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        heap_used: memUsage.heapUsed,
        heap_total: memUsage.heapTotal
      },
      network: {
        connections: await this.getNetworkConnections(),
        bytes_sent: 0, // Would implement actual network stats
        bytes_received: 0
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        threads: 0, // Would get actual thread count
        handles: 0 // Would get actual handle count
      },
      application: {
        active_sessions: await this.getActiveSessions(),
        active_players: await this.getActivePlayers(),
        active_regions: await this.getActiveRegions(),
        events_per_second: await this.getEventsPerSecond(),
        database_connections: await this.getDatabaseConnections(),
        cache_hit_rate: await this.getCacheHitRate()
      }
    };
  }

  private async getCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = Date.now();
      
      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const elapsedTime = Date.now() - startTime;
        const elapsedUserMS = currentUsage.user / 1000;
        const elapsedSystemMS = currentUsage.system / 1000;
        const cpuPercent = ((elapsedUserMS + elapsedSystemMS) / elapsedTime) * 100;
        
        resolve(Math.min(100, cpuPercent));
      }, 100);
    });
  }

  private async getNetworkConnections(): Promise<number> {
    // Would implement actual network connection counting
    return 50;
  }

  private async getActiveSessions(): Promise<number> {
    // Would query session repository
    return 100;
  }

  private async getActivePlayers(): Promise<number> {
    // Would query player repository for online players
    return 75;
  }

  private async getActiveRegions(): Promise<number> {
    // Would query region repository for active regions
    return 5;
  }

  private async getEventsPerSecond(): Promise<number> {
    // Would calculate from event queue metrics
    return 25;
  }

  private async getDatabaseConnections(): Promise<number> {
    // Would get from database pool
    return 10;
  }

  private async getCacheHitRate(): Promise<number> {
    // Would get from cache statistics
    return 0.85;
  }

  private async runHealthChecks(): Promise<void> {
    for (const [service, healthCheck] of this.healthChecks) {
      try {
        // For this implementation, we'll simulate health checks
        const result = await this.simulateHealthCheck(service);
        
        const updatedCheck: HealthCheck = {
          service,
          status: result.status,
          response_time: result.response_time,
          last_check: new Date(),
          error: result.error,
          metadata: result.metadata
        };

        this.healthChecks.set(service, updatedCheck);
        this.emit('health_check_completed', updatedCheck);

        // Create alert if service is unhealthy
        if (result.status === 'unhealthy') {
          this.createAlert({
            type: 'health',
            severity: 'error',
            title: `Service Unhealthy: ${service}`,
            description: `Health check failed for ${service}: ${result.error}`,
            metric: `health_${service}`,
            current_value: result.response_time
          });
        }

      } catch (error) {
        logger.error(`Health check failed for ${service}`, { error: error.message });
      }
    }
  }

  private async simulateHealthCheck(service: string): Promise<Omit<HealthCheck, 'service' | 'last_check'>> {
    const responseTime = Math.random() * 100 + 10; // 10-110ms
    const isHealthy = Math.random() > 0.05; // 95% chance of being healthy
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      response_time: responseTime,
      error: isHealthy ? undefined : 'Simulated service error',
      metadata: { simulation: true }
    };
  }

  private checkAlerts(metrics: SystemMetrics): void {
    // CPU usage alert
    if (metrics.cpu.usage > this.config.alert_thresholds.cpu_usage) {
      this.createAlert({
        type: 'performance',
        severity: 'warning',
        title: 'High CPU Usage',
        description: `CPU usage is ${metrics.cpu.usage.toFixed(2)}%`,
        metric: 'cpu_usage',
        threshold: this.config.alert_thresholds.cpu_usage,
        current_value: metrics.cpu.usage
      });
    }

    // Memory usage alert
    if (metrics.memory.usage_percent > this.config.alert_thresholds.memory_usage) {
      this.createAlert({
        type: 'performance',
        severity: 'warning',
        title: 'High Memory Usage',
        description: `Memory usage is ${metrics.memory.usage_percent.toFixed(2)}%`,
        metric: 'memory_usage',
        threshold: this.config.alert_thresholds.memory_usage,
        current_value: metrics.memory.usage_percent
      });
    }

    // Application-specific alerts
    if (metrics.application.cache_hit_rate < 0.7) {
      this.createAlert({
        type: 'performance',
        severity: 'info',
        title: 'Low Cache Hit Rate',
        description: `Cache hit rate is ${(metrics.application.cache_hit_rate * 100).toFixed(1)}%`,
        metric: 'cache_hit_rate',
        current_value: metrics.application.cache_hit_rate
      });
    }
  }

  private createAlert(alert: Omit<Alert, 'id' | 'timestamp'>): void {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullAlert: Alert = {
      id: alertId,
      timestamp: new Date(),
      ...alert
    };

    this.alerts.set(alertId, fullAlert);
    
    // Log the alert
    const logLevel = alert.severity === 'critical' ? 'error' : 
                    alert.severity === 'error' ? 'error' :
                    alert.severity === 'warning' ? 'warn' : 'info';
    
    logger[logLevel](`Alert: ${alert.title}`, {
      alertId,
      type: alert.type,
      severity: alert.severity,
      metric: alert.metric,
      threshold: alert.threshold,
      currentValue: alert.current_value
    });

    this.emit('alert_created', fullAlert);
  }

  private pruneMetrics(): void {
    const cutoffTime = Date.now() - (this.config.retention_hours * 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoffTime);
  }

  // Public API methods
  getLatestMetrics(): SystemMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getMetricsHistory(hours: number = 24): SystemMetrics[] {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    return this.metrics.filter(m => m.timestamp.getTime() > cutoffTime);
  }

  getHealthStatus(): Map<string, HealthCheck> {
    return new Map(this.healthChecks);
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolved_at = new Date();
      this.alerts.set(alertId, alert);
      
      logger.info(`Alert resolved: ${alert.title}`, { alertId });
      this.emit('alert_resolved', alert);
      
      return true;
    }
    return false;
  }

  getSystemHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const healthChecks = Array.from(this.healthChecks.values());
    const unhealthyCount = healthChecks.filter(hc => hc.status === 'unhealthy').length;
    const degradedCount = healthChecks.filter(hc => hc.status === 'degraded').length;

    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    return 'healthy';
  }

  getPerformanceMetrics(): {
    avg_cpu: number;
    avg_memory: number;
    avg_response_time: number;
    uptime: number;
  } {
    if (this.metrics.length === 0) {
      return { avg_cpu: 0, avg_memory: 0, avg_response_time: 0, uptime: 0 };
    }

    const recent = this.metrics.slice(-60); // Last 60 readings
    
    return {
      avg_cpu: recent.reduce((sum, m) => sum + m.cpu.usage, 0) / recent.length,
      avg_memory: recent.reduce((sum, m) => sum + m.memory.usage_percent, 0) / recent.length,
      avg_response_time: Array.from(this.healthChecks.values())
        .reduce((sum, hc) => sum + hc.response_time, 0) / this.healthChecks.size,
      uptime: process.uptime()
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down system monitor');
    
    this.isCollecting = false;
    
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.removeAllListeners();
    this.metrics.length = 0;
    this.healthChecks.clear();
    this.alerts.clear();
  }
}

// Export singleton instance
export const systemMonitor = new SystemMonitor();

// Export convenience functions
export const getSystemMetrics = () => systemMonitor.getLatestMetrics();
export const getSystemHealth = () => systemMonitor.getSystemHealth();
export const getActiveAlerts = () => systemMonitor.getActiveAlerts();

export default systemMonitor;
