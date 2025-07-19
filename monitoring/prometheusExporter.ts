import express from 'express';
import { register, collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client';
import { logger } from '../logging/logger';
import { systemMonitor } from '../logging/monitoring';

/**
 * Prometheus metrics exporter for MMORPG backend
 * Exposes custom application metrics and system metrics for monitoring
 */

export class PrometheusExporter {
  private app: express.Application;
  private server?: any;
  private isInitialized = false;

  // Custom metrics
  private httpRequestDuration: Histogram<string>;
  private httpRequestsTotal: Counter<string>;
  private activePlayersGauge: Gauge<string>;
  private activeSessionsGauge: Gauge<string>;
  private activeRegionsGauge: Gauge<string>;
  private databaseConnectionsGauge: Gauge<string>;
  private cacheHitRateGauge: Gauge<string>;
  private eventQueueSizeGauge: Gauge<string>;
  private gameEventsTotal: Counter<string>;
  private playerActionsTotal: Counter<string>;
  private combatEventsTotal: Counter<string>;
  private errorRateGauge: Gauge<string>;
  private responseTimeHistogram: Histogram<string>;

  constructor() {
    this.app = express();
    this.setupDefaultMetrics();
    this.setupCustomMetrics();
    this.setupRoutes();
  }

  private setupDefaultMetrics(): void {
    // Collect default Node.js metrics
    collectDefaultMetrics({
      register,
      prefix: 'mmorpg_nodejs_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      eventLoopMonitoringPrecision: 5
    });
  }

  private setupCustomMetrics(): void {
    // HTTP metrics
    this.httpRequestDuration = new Histogram({
      name: 'mmorpg_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    });

    this.httpRequestsTotal = new Counter({
      name: 'mmorpg_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });

    // Application metrics
    this.activePlayersGauge = new Gauge({
      name: 'mmorpg_active_players',
      help: 'Number of currently active players',
      labelNames: ['region']
    });

    this.activeSessionsGauge = new Gauge({
      name: 'mmorpg_active_sessions',
      help: 'Number of currently active sessions'
    });

    this.activeRegionsGauge = new Gauge({
      name: 'mmorpg_active_regions',
      help: 'Number of currently active regions',
      labelNames: ['status']
    });

    this.databaseConnectionsGauge = new Gauge({
      name: 'mmorpg_database_connections',
      help: 'Number of active database connections',
      labelNames: ['database', 'state']
    });

    this.cacheHitRateGauge = new Gauge({
      name: 'mmorpg_cache_hit_rate',
      help: 'Cache hit rate as a percentage',
      labelNames: ['cache_type']
    });

    this.eventQueueSizeGauge = new Gauge({
      name: 'mmorpg_event_queue_size',
      help: 'Number of events in processing queue',
      labelNames: ['queue_name', 'status']
    });

    // Game-specific metrics
    this.gameEventsTotal = new Counter({
      name: 'mmorpg_game_events_total',
      help: 'Total number of game events processed',
      labelNames: ['event_type', 'region']
    });

    this.playerActionsTotal = new Counter({
      name: 'mmorpg_player_actions_total',
      help: 'Total number of player actions',
      labelNames: ['action_type', 'player_level', 'region']
    });

    this.combatEventsTotal = new Counter({
      name: 'mmorpg_combat_events_total',
      help: 'Total number of combat events',
      labelNames: ['combat_type', 'outcome', 'region']
    });

    // Performance metrics
    this.errorRateGauge = new Gauge({
      name: 'mmorpg_error_rate',
      help: 'Application error rate as a percentage',
      labelNames: ['error_type']
    });

    this.responseTimeHistogram = new Histogram({
      name: 'mmorpg_response_time_seconds',
      help: 'Response time for various operations',
      labelNames: ['operation', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30]
    });

    // Register all custom metrics
    register.registerMetric(this.httpRequestDuration);
    register.registerMetric(this.httpRequestsTotal);
    register.registerMetric(this.activePlayersGauge);
    register.registerMetric(this.activeSessionsGauge);
    register.registerMetric(this.activeRegionsGauge);
    register.registerMetric(this.databaseConnectionsGauge);
    register.registerMetric(this.cacheHitRateGauge);
    register.registerMetric(this.eventQueueSizeGauge);
    register.registerMetric(this.gameEventsTotal);
    register.registerMetric(this.playerActionsTotal);
    register.registerMetric(this.combatEventsTotal);
    register.registerMetric(this.errorRateGauge);
    register.registerMetric(this.responseTimeHistogram);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const health = systemMonitor.getSystemHealth();
      const statusCode = health === 'healthy' ? 200 : health === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json({
        status: health,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', async (req, res) => {
      try {
        // Update metrics before serving
        await this.updateMetrics();
        
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
      } catch (error) {
        logger.error('Failed to generate metrics', { error: error.message });
        res.status(500).end('Error generating metrics');
      }
    });

    // Detailed metrics endpoint
    this.app.get('/metrics/detailed', async (req, res) => {
      try {
        const systemMetrics = systemMonitor.getLatestMetrics();
        const healthStatus = systemMonitor.getHealthStatus();
        const activeAlerts = systemMonitor.getActiveAlerts();
        const performanceMetrics = systemMonitor.getPerformanceMetrics();

        res.json({
          timestamp: new Date().toISOString(),
          system: systemMetrics,
          health: Object.fromEntries(healthStatus),
          alerts: activeAlerts,
          performance: performanceMetrics,
          uptime: process.uptime()
        });
      } catch (error) {
        logger.error('Failed to generate detailed metrics', { error: error.message });
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });
  }

  private async updateMetrics(): Promise<void> {
    try {
      const systemMetrics = systemMonitor.getLatestMetrics();
      
      if (systemMetrics) {
        // Update application metrics
        this.activePlayersGauge.set(systemMetrics.application.active_players);
        this.activeSessionsGauge.set(systemMetrics.application.active_sessions);
        this.activeRegionsGauge.set({ status: 'active' }, systemMetrics.application.active_regions);
        this.databaseConnectionsGauge.set(
          { database: 'primary', state: 'active' },
          systemMetrics.application.database_connections
        );
        this.cacheHitRateGauge.set(
          { cache_type: 'redis' },
          systemMetrics.application.cache_hit_rate * 100
        );
        this.eventQueueSizeGauge.set(
          { queue_name: 'main', status: 'pending' },
          systemMetrics.application.events_per_second
        );
      }

      // Update health-based metrics
      const healthStatus = systemMonitor.getSystemHealth();
      const healthScore = healthStatus === 'healthy' ? 100 : healthStatus === 'degraded' ? 75 : 0;
      this.errorRateGauge.set({ error_type: 'health' }, 100 - healthScore);

    } catch (error) {
      logger.error('Failed to update metrics', { error: error.message });
    }
  }

  async initialize(port: number = 9090): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.server = this.app.listen(port, '0.0.0.0', () => {
        logger.info(`Prometheus exporter listening on port ${port}`);
      });

      // Start periodic metric updates
      setInterval(() => {
        this.updateMetrics().catch(error => {
          logger.error('Periodic metric update failed', { error: error.message });
        });
      }, 30000); // Update every 30 seconds

      this.isInitialized = true;
      logger.info('Prometheus exporter initialized');
    } catch (error) {
      logger.error('Failed to initialize Prometheus exporter', { error: error.message });
      throw error;
    }
  }

  // Public methods for recording metrics
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration / 1000
    );
    
    this.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString()
    });
  }

  recordGameEvent(eventType: string, region: string): void {
    this.gameEventsTotal.inc({ event_type: eventType, region });
  }

  recordPlayerAction(actionType: string, playerLevel: number, region: string): void {
    const levelRange = this.getLevelRange(playerLevel);
    this.playerActionsTotal.inc({
      action_type: actionType,
      player_level: levelRange,
      region
    });
  }

  recordCombatEvent(combatType: string, outcome: string, region: string): void {
    this.combatEventsTotal.inc({
      combat_type: combatType,
      outcome,
      region
    });
  }

  recordResponseTime(operation: string, status: string, duration: number): void {
    this.responseTimeHistogram.observe(
      { operation, status },
      duration / 1000
    );
  }

  recordError(errorType: string, rate: number): void {
    this.errorRateGauge.set({ error_type: errorType }, rate);
  }

  private getLevelRange(level: number): string {
    if (level <= 10) return '1-10';
    if (level <= 25) return '11-25';
    if (level <= 50) return '26-50';
    if (level <= 75) return '51-75';
    return '76-100';
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Prometheus exporter');
    
    if (this.server) {
      this.server.close();
    }
    
    register.clear();
    this.isInitialized = false;
    
    logger.info('Prometheus exporter shutdown complete');
  }
}

// Middleware function for Express apps
export function prometheusMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      prometheusExporter.recordHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration
      );
    });
    
    next();
  };
}

// Export singleton instance
export const prometheusExporter = new PrometheusExporter();

// Export convenience functions
export const recordHttpRequest = prometheusExporter.recordHttpRequest.bind(prometheusExporter);
export const recordGameEvent = prometheusExporter.recordGameEvent.bind(prometheusExporter);
export const recordPlayerAction = prometheusExporter.recordPlayerAction.bind(prometheusExporter);
export const recordCombatEvent = prometheusExporter.recordCombatEvent.bind(prometheusExporter);
export const recordResponseTime = prometheusExporter.recordResponseTime.bind(prometheusExporter);

export default prometheusExporter;
