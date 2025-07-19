import { logger } from './logger';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

/**
 * Audit logging system for security and compliance tracking
 * Records all significant actions, access attempts, and data modifications
 */

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  changes?: {
    before?: any;
    after?: any;
  };
  risk_score?: number;
}

export interface AuditConfiguration {
  enabled: boolean;
  retention_days: number;
  high_risk_actions: string[];
  sensitive_fields: string[];
  alert_thresholds: {
    failed_logins: number;
    privilege_escalations: number;
    data_access_volume: number;
  };
}

export class AuditLogger extends EventEmitter {
  private config: AuditConfiguration;
  private events: AuditEvent[] = [];
  private maxEvents = 100000;
  private alertCounts: Map<string, { count: number; window: Date }> = new Map();

  constructor(config?: Partial<AuditConfiguration>) {
    super();
    
    this.config = {
      enabled: process.env.AUDIT_ENABLED !== 'false',
      retention_days: parseInt(process.env.AUDIT_RETENTION_DAYS || '90'),
      high_risk_actions: [
        'admin_login',
        'privilege_escalation', 
        'user_deletion',
        'data_export',
        'config_change',
        'security_setting_change'
      ],
      sensitive_fields: [
        'password',
        'passwordHash',
        'email',
        'ipAddress',
        'sessionToken',
        'apiKey'
      ],
      alert_thresholds: {
        failed_logins: 5,
        privilege_escalations: 1,
        data_access_volume: 1000
      },
      ...config
    };
  }

  /**
   * Log an audit event
   */
  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const auditEvent: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event
    };

    // Calculate risk score
    auditEvent.risk_score = this.calculateRiskScore(auditEvent);

    // Sanitize sensitive data
    auditEvent.details = this.sanitizeData(auditEvent.details);
    if (auditEvent.changes) {
      auditEvent.changes.before = this.sanitizeData(auditEvent.changes.before);
      auditEvent.changes.after = this.sanitizeData(auditEvent.changes.after);
    }

    this.events.push(auditEvent);
    this.pruneEvents();

    // Log to main logger
    const logLevel = this.getLogLevel(auditEvent.severity);
    logger[logLevel](`Audit: ${auditEvent.action}`, {
      auditId: auditEvent.id,
      resource: auditEvent.resource,
      outcome: auditEvent.outcome,
      riskScore: auditEvent.risk_score,
      userId: auditEvent.userId
    });

    // Check for alerts
    await this.checkAlerts(auditEvent);

    // Emit event for real-time processing
    this.emit('audit_event', auditEvent);

    return auditEvent.id;
  }

  /**
   * Log authentication events
   */
  async logAuthentication(userId: string, action: 'login' | 'logout' | 'failed_login', details?: any): Promise<string> {
    return this.logEvent({
      userId,
      action: `auth_${action}`,
      resource: 'authentication',
      outcome: action === 'failed_login' ? 'failure' : 'success',
      severity: action === 'failed_login' ? 'medium' : 'low',
      details
    });
  }

  /**
   * Log data access events
   */
  async logDataAccess(userId: string, resource: string, resourceId: string, action: 'read' | 'write' | 'delete', outcome: 'success' | 'failure' | 'denied', details?: any): Promise<string> {
    const severity = action === 'delete' ? 'high' : action === 'write' ? 'medium' : 'low';
    
    return this.logEvent({
      userId,
      action: `data_${action}`,
      resource,
      resourceId,
      outcome,
      severity,
      details
    });
  }

  /**
   * Log administrative actions
   */
  async logAdminAction(userId: string, action: string, resource: string, resourceId?: string, changes?: any, outcome: 'success' | 'failure' | 'denied' = 'success'): Promise<string> {
    return this.logEvent({
      userId,
      action: `admin_${action}`,
      resource,
      resourceId,
      outcome,
      severity: 'high',
      changes: changes ? { before: changes.before, after: changes.after } : undefined
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', details?: any, userId?: string): Promise<string> {
    return this.logEvent({
      userId,
      action: `security_${event}`,
      resource: 'security',
      outcome: 'success',
      severity,
      details
    });
  }

  /**
   * Log configuration changes
   */
  async logConfigChange(userId: string, configKey: string, oldValue: any, newValue: any): Promise<string> {
    return this.logEvent({
      userId,
      action: 'config_change',
      resource: 'configuration',
      resourceId: configKey,
      outcome: 'success',
      severity: 'high',
      changes: {
        before: oldValue,
        after: newValue
      }
    });
  }

  /**
   * Query audit events
   */
  queryEvents(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    outcome?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AuditEvent[] {
    let filtered = [...this.events];

    if (filters.userId) {
      filtered = filtered.filter(e => e.userId === filters.userId);
    }
    if (filters.action) {
      filtered = filtered.filter(e => e.action.includes(filters.action));
    }
    if (filters.resource) {
      filtered = filtered.filter(e => e.resource === filters.resource);
    }
    if (filters.outcome) {
      filtered = filtered.filter(e => e.outcome === filters.outcome);
    }
    if (filters.severity) {
      filtered = filtered.filter(e => e.severity === filters.severity);
    }
    if (filters.startDate) {
      filtered = filtered.filter(e => e.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      filtered = filtered.filter(e => e.timestamp <= filters.endDate!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return filtered.slice(0, filters.limit || 1000);
  }

  /**
   * Get audit statistics
   */
  getStatistics(timeframe?: { start: Date; end: Date }) {
    let events = this.events;
    
    if (timeframe) {
      events = events.filter(e => 
        e.timestamp >= timeframe.start && e.timestamp <= timeframe.end
      );
    }

    const stats = {
      total_events: events.length,
      by_outcome: {} as Record<string, number>,
      by_severity: {} as Record<string, number>,
      by_action: {} as Record<string, number>,
      by_user: {} as Record<string, number>,
      high_risk_events: events.filter(e => (e.risk_score || 0) > 7).length,
      failed_events: events.filter(e => e.outcome === 'failure').length,
      security_events: events.filter(e => e.resource === 'security').length
    };

    events.forEach(event => {
      stats.by_outcome[event.outcome] = (stats.by_outcome[event.outcome] || 0) + 1;
      stats.by_severity[event.severity] = (stats.by_severity[event.severity] || 0) + 1;
      stats.by_action[event.action] = (stats.by_action[event.action] || 0) + 1;
      if (event.userId) {
        stats.by_user[event.userId] = (stats.by_user[event.userId] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(startDate: Date, endDate: Date) {
    const events = this.queryEvents({ startDate, endDate });
    
    return {
      period: { start: startDate, end: endDate },
      summary: this.getStatistics({ start: startDate, end: endDate }),
      critical_events: events.filter(e => e.severity === 'critical'),
      failed_access_attempts: events.filter(e => e.outcome === 'failure' || e.outcome === 'denied'),
      data_modifications: events.filter(e => e.changes && Object.keys(e.changes).length > 0),
      admin_actions: events.filter(e => e.action.startsWith('admin_')),
      security_incidents: events.filter(e => e.resource === 'security'),
      high_risk_users: this.identifyHighRiskUsers(events),
      compliance_score: this.calculateComplianceScore(events)
    };
  }

  private generateEventId(): string {
    return `audit_${Date.now()}_${createHash('md5').update(`${Math.random()}`).digest('hex').substring(0, 8)}`;
  }

  private calculateRiskScore(event: AuditEvent): number {
    let score = 0;

    // Base score by severity
    const severityScores = { low: 1, medium: 3, high: 6, critical: 9 };
    score += severityScores[event.severity];

    // Outcome modifier
    if (event.outcome === 'failure') score += 2;
    if (event.outcome === 'denied') score += 1;

    // High risk action modifier
    if (this.config.high_risk_actions.includes(event.action)) {
      score += 3;
    }

    // Time-based modifier (night/weekend activities are riskier)
    const hour = event.timestamp.getHours();
    const isWeekend = [0, 6].includes(event.timestamp.getDay());
    if (hour < 6 || hour > 22 || isWeekend) {
      score += 1;
    }

    return Math.min(10, score);
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    
    this.config.sensitive_fields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private getLogLevel(severity: string): 'error' | 'warn' | 'info' | 'debug' {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'error';
      case 'medium': return 'warn';
      case 'low': return 'info';
      default: return 'debug';
    }
  }

  private async checkAlerts(event: AuditEvent): Promise<void> {
    const now = new Date();
    const windowSize = 5 * 60 * 1000; // 5 minutes

    // Check failed login threshold
    if (event.action === 'auth_failed_login') {
      const key = `failed_login_${event.userId || event.ipAddress}`;
      const alertData = this.alertCounts.get(key) || { count: 0, window: now };
      
      if (now.getTime() - alertData.window.getTime() > windowSize) {
        alertData.count = 1;
        alertData.window = now;
      } else {
        alertData.count++;
      }
      
      this.alertCounts.set(key, alertData);
      
      if (alertData.count >= this.config.alert_thresholds.failed_logins) {
        await this.triggerAlert('multiple_failed_logins', event, { 
          count: alertData.count,
          threshold: this.config.alert_thresholds.failed_logins 
        });
      }
    }

    // Check privilege escalation
    if (event.action.includes('privilege') || event.action.includes('admin')) {
      await this.triggerAlert('privilege_escalation', event);
    }

    // Check high risk score
    if ((event.risk_score || 0) >= 8) {
      await this.triggerAlert('high_risk_activity', event, { riskScore: event.risk_score });
    }
  }

  private async triggerAlert(alertType: string, event: AuditEvent, metadata?: any): Promise<void> {
    const alert = {
      type: alertType,
      timestamp: new Date(),
      auditEvent: event,
      metadata
    };

    logger.warn(`Security Alert: ${alertType}`, alert);
    this.emit('security_alert', alert);
  }

  private identifyHighRiskUsers(events: AuditEvent[]): Array<{ userId: string; riskScore: number; eventCount: number }> {
    const userRisks = new Map<string, { totalRisk: number; eventCount: number }>();

    events.forEach(event => {
      if (event.userId) {
        const current = userRisks.get(event.userId) || { totalRisk: 0, eventCount: 0 };
        current.totalRisk += event.risk_score || 0;
        current.eventCount++;
        userRisks.set(event.userId, current);
      }
    });

    return Array.from(userRisks.entries())
      .map(([userId, data]) => ({
        userId,
        riskScore: data.eventCount > 0 ? data.totalRisk / data.eventCount : 0,
        eventCount: data.eventCount
      }))
      .filter(user => user.riskScore > 5)
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  private calculateComplianceScore(events: AuditEvent[]): number {
    if (events.length === 0) return 100;

    const criticalEvents = events.filter(e => e.severity === 'critical').length;
    const failedEvents = events.filter(e => e.outcome === 'failure').length;
    const highRiskEvents = events.filter(e => (e.risk_score || 0) > 7).length;

    const penalty = (criticalEvents * 10) + (failedEvents * 5) + (highRiskEvents * 3);
    const maxPenalty = events.length * 10;
    
    return Math.max(0, 100 - Math.min(100, (penalty / maxPenalty) * 100));
  }

  private pruneEvents(): void {
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Remove events older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retention_days);
    
    this.events = this.events.filter(event => event.timestamp > cutoffDate);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down audit logger');
    this.removeAllListeners();
    this.events.length = 0;
    this.alertCounts.clear();
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();

// Export convenience functions
export const logAuditEvent = auditLogger.logEvent.bind(auditLogger);
export const logAuthentication = auditLogger.logAuthentication.bind(auditLogger);
export const logDataAccess = auditLogger.logDataAccess.bind(auditLogger);
export const logAdminAction = auditLogger.logAdminAction.bind(auditLogger);
export const logSecurityEvent = auditLogger.logSecurityEvent.bind(auditLogger);
export const logConfigChange = auditLogger.logConfigChange.bind(auditLogger);

export default auditLogger;
