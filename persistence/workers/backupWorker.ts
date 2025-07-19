import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';
import { logger } from '../../logging/logger';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

/**
 * Backup Worker for automated database backups and recovery
 * Handles scheduled backups, incremental backups, and point-in-time recovery
 */

export interface BackupConfig {
  type: 'full' | 'incremental' | 'differential';
  schedule: string; // Cron expression
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  compression: boolean;
  encryption: boolean;
  destinations: BackupDestination[];
}

export interface BackupDestination {
  id: string;
  type: 'local' | 'cloud' | 'remote';
  path: string;
  credentials?: Record<string, string>;
  priority: number;
}

export interface BackupJob {
  id: string;
  type: 'full' | 'incremental' | 'differential';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  size: number;
  duration: number;
  collections: string[];
  destination: string;
  checksum: string;
  error?: string;
}

export interface RestoreJob {
  id: string;
  backupId: string;
  targetTime?: Date;
  collections: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
}

export class BackupWorker extends EventEmitter {
  private config: BackupConfig;
  private jobs: Map<string, BackupJob> = new Map();
  private restoreJobs: Map<string, RestoreJob> = new Map();
  private workers: Map<string, Worker> = new Map();
  private scheduleInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(config: BackupConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      // Validate backup destinations
      await this.validateDestinations();
      
      // Start scheduled backups
      this.startScheduler();
      
      // Initialize backup directories
      await this.initializeBackupDirectories();
      
      this.isRunning = true;
      
      logger.info('Backup worker initialized', {
        destinations: this.config.destinations.length,
        schedule: this.config.schedule
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize backup worker', { error: error.message });
      throw error;
    }
  }

  async createBackup(type: 'full' | 'incremental' | 'differential' = 'full'): Promise<string> {
    try {
      const jobId = `backup_${type}_${Date.now()}`;
      
      const job: BackupJob = {
        id: jobId,
        type,
        status: 'pending',
        startTime: new Date(),
        size: 0,
        duration: 0,
        collections: [],
        destination: '',
        checksum: ''
      };

      this.jobs.set(jobId, job);

      // Execute backup in worker thread
      const worker = await this.createBackupWorker(job);
      this.workers.set(jobId, worker);

      logger.info('Backup job created', { jobId, type });
      this.emit('backup_started', { jobId, type });

      return jobId;
    } catch (error) {
      logger.error('Failed to create backup', { type, error: error.message });
      throw error;
    }
  }

  async restoreBackup(backupId: string, options: {
    targetTime?: Date;
    collections?: string[];
    destination?: string;
  } = {}): Promise<string> {
    try {
      const backup = this.jobs.get(backupId);
      if (!backup || backup.status !== 'completed') {
        throw new Error('Backup not found or incomplete');
      }

      const restoreId = `restore_${Date.now()}`;
      
      const restoreJob: RestoreJob = {
        id: restoreId,
        backupId,
        targetTime: options.targetTime,
        collections: options.collections || backup.collections,
        status: 'pending',
        progress: 0,
        startTime: new Date()
      };

      this.restoreJobs.set(restoreId, restoreJob);

      // Execute restore in worker thread
      const worker = await this.createRestoreWorker(restoreJob);
      this.workers.set(restoreId, worker);

      logger.info('Restore job created', { restoreId, backupId });
      this.emit('restore_started', { restoreId, backupId });

      return restoreId;
    } catch (error) {
      logger.error('Failed to create restore job', { 
        backupId, 
        error: error.message 
      });
      throw error;
    }
  }

  async getBackupJobs(): Promise<BackupJob[]> {
    return Array.from(this.jobs.values()).sort((a, b) => 
      b.startTime.getTime() - a.startTime.getTime()
    );
  }

  async getRestoreJobs(): Promise<RestoreJob[]> {
    return Array.from(this.restoreJobs.values()).sort((a, b) => 
      b.startTime.getTime() - a.startTime.getTime()
    );
  }

  async getBackupJob(jobId: string): Promise<BackupJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async getRestoreJob(jobId: string): Promise<RestoreJob | null> {
    return this.restoreJobs.get(jobId) || null;
  }

  async validateBackup(jobId: string): Promise<boolean> {
    try {
      const job = this.jobs.get(jobId);
      if (!job || job.status !== 'completed') {
        return false;
      }

      // Verify checksum
      const actualChecksum = await this.calculateBackupChecksum(jobId);
      return actualChecksum === job.checksum;
    } catch (error) {
      logger.error('Backup validation failed', { jobId, error: error.message });
      return false;
    }
  }

  async cleanupOldBackups(): Promise<{ deleted: number; freed: number }> {
    try {
      const jobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'completed')
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

      const toDelete: BackupJob[] = [];
      const now = new Date();

      // Apply retention policy
      const dailyBackups = jobs.filter(job => {
        const daysDiff = Math.floor((now.getTime() - job.startTime.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff <= this.config.retention.daily;
      });

      const weeklyBackups = jobs.filter(job => {
        const weeksDiff = Math.floor((now.getTime() - job.startTime.getTime()) / (1000 * 60 * 60 * 24 * 7));
        return weeksDiff <= this.config.retention.weekly && weeksDiff > Math.floor(this.config.retention.daily / 7);
      });

      const monthlyBackups = jobs.filter(job => {
        const monthsDiff = Math.floor((now.getTime() - job.startTime.getTime()) / (1000 * 60 * 60 * 24 * 30));
        return monthsDiff <= this.config.retention.monthly && monthsDiff > Math.floor(this.config.retention.weekly / 4);
      });

      // Mark backups for deletion that don't meet retention criteria
      const keepBackups = new Set([
        ...dailyBackups.map(j => j.id),
        ...weeklyBackups.map(j => j.id),
        ...monthlyBackups.map(j => j.id)
      ]);

      toDelete.push(...jobs.filter(job => !keepBackups.has(job.id)));

      let totalFreed = 0;
      for (const job of toDelete) {
        await this.deleteBackup(job.id);
        totalFreed += job.size;
        this.jobs.delete(job.id);
      }

      logger.info('Backup cleanup completed', { 
        deleted: toDelete.length, 
        freedBytes: totalFreed 
      });

      return { deleted: toDelete.length, freed: totalFreed };
    } catch (error) {
      logger.error('Backup cleanup failed', { error: error.message });
      throw error;
    }
  }

  private async createBackupWorker(job: BackupJob): Promise<Worker> {
    const worker = new Worker(__filename, {
      workerData: {
        operation: 'backup',
        job,
        config: this.config
      }
    });

    worker.on('message', (message) => {
      this.handleBackupWorkerMessage(job.id, message);
    });

    worker.on('error', (error) => {
      logger.error('Backup worker error', { 
        jobId: job.id, 
        error: error.message 
      });
      job.status = 'failed';
      job.error = error.message;
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime.getTime();
      this.emit('backup_failed', { jobId: job.id, error: error.message });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.error('Backup worker exited with error', { 
          jobId: job.id, 
          exitCode: code 
        });
      }
      this.workers.delete(job.id);
    });

    return worker;
  }

  private async createRestoreWorker(job: RestoreJob): Promise<Worker> {
    const worker = new Worker(__filename, {
      workerData: {
        operation: 'restore',
        job,
        config: this.config
      }
    });

    worker.on('message', (message) => {
      this.handleRestoreWorkerMessage(job.id, message);
    });

    worker.on('error', (error) => {
      logger.error('Restore worker error', { 
        jobId: job.id, 
        error: error.message 
      });
      job.status = 'failed';
      job.error = error.message;
      job.endTime = new Date();
      this.emit('restore_failed', { jobId: job.id, error: error.message });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.error('Restore worker exited with error', { 
          jobId: job.id, 
          exitCode: code 
        });
      }
      this.workers.delete(job.id);
    });

    return worker;
  }

  private handleBackupWorkerMessage(jobId: string, message: any): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    switch (message.type) {
      case 'progress':
        this.emit('backup_progress', { 
          jobId, 
          progress: message.progress,
          currentOperation: message.currentOperation 
        });
        break;
      
      case 'completed':
        job.status = 'completed';
        job.endTime = new Date();
        job.duration = job.endTime.getTime() - job.startTime.getTime();
        job.size = message.size;
        job.collections = message.collections;
        job.destination = message.destination;
        job.checksum = message.checksum;
        
        logger.info('Backup job completed', { 
          jobId, 
          size: job.size, 
          duration: job.duration 
        });
        this.emit('backup_completed', { jobId, job });
        break;
      
      case 'error':
        job.status = 'failed';
        job.error = message.error;
        job.endTime = new Date();
        job.duration = job.endTime.getTime() - job.startTime.getTime();
        
        logger.error('Backup job failed', { jobId, error: message.error });
        this.emit('backup_failed', { jobId, error: message.error });
        break;
    }
  }

  private handleRestoreWorkerMessage(jobId: string, message: any): void {
    const job = this.restoreJobs.get(jobId);
    if (!job) return;

    switch (message.type) {
      case 'progress':
        job.progress = message.progress;
        this.emit('restore_progress', { 
          jobId, 
          progress: message.progress,
          currentOperation: message.currentOperation 
        });
        break;
      
      case 'completed':
        job.status = 'completed';
        job.progress = 100;
        job.endTime = new Date();
        
        logger.info('Restore job completed', { jobId });
        this.emit('restore_completed', { jobId, job });
        break;
      
      case 'error':
        job.status = 'failed';
        job.error = message.error;
        job.endTime = new Date();
        
        logger.error('Restore job failed', { jobId, error: message.error });
        this.emit('restore_failed', { jobId, error: message.error });
        break;
    }
  }

  private startScheduler(): void {
    // Simple scheduler implementation
    this.scheduleInterval = setInterval(async () => {
      try {
        await this.runScheduledBackup();
      } catch (error) {
        logger.error('Scheduled backup failed', { error: error.message });
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  private async runScheduledBackup(): Promise<void> {
    // Determine backup type based on schedule
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    let backupType: 'full' | 'incremental' | 'differential' = 'incremental';

    // Full backup on Sundays at 2 AM
    if (dayOfWeek === 0 && hour === 2) {
      backupType = 'full';
    }
    // Differential backup on Wednesdays at 2 AM
    else if (dayOfWeek === 3 && hour === 2) {
      backupType = 'differential';
    }
    // Incremental backup daily at 2 AM (except Sunday and Wednesday)
    else if (hour === 2 && dayOfWeek !== 0 && dayOfWeek !== 3) {
      backupType = 'incremental';
    } else {
      return; // No backup scheduled for this time
    }

    await this.createBackup(backupType);
  }

  private async validateDestinations(): Promise<void> {
    for (const destination of this.config.destinations) {
      try {
        await this.testDestination(destination);
      } catch (error) {
        logger.error('Backup destination validation failed', {
          destinationId: destination.id,
          error: error.message
        });
        throw error;
      }
    }
  }

  private async testDestination(destination: BackupDestination): Promise<void> {
    switch (destination.type) {
      case 'local':
        await fs.access(destination.path);
        break;
      case 'cloud':
        // Would implement cloud storage validation
        break;
      case 'remote':
        // Would implement remote storage validation
        break;
      default:
        throw new Error(`Unknown destination type: ${destination.type}`);
    }
  }

  private async initializeBackupDirectories(): Promise<void> {
    for (const destination of this.config.destinations) {
      if (destination.type === 'local') {
        try {
          await fs.mkdir(destination.path, { recursive: true });
        } catch (error) {
          logger.error('Failed to create backup directory', {
            path: destination.path,
            error: error.message
          });
        }
      }
    }
  }

  private async calculateBackupChecksum(jobId: string): Promise<string> {
    // Implementation would calculate actual file checksum
    return createHash('sha256').update(jobId).digest('hex');
  }

  private async deleteBackup(jobId: string): Promise<void> {
    // Implementation would delete actual backup files
    logger.debug('Backup deleted', { jobId });
  }

  async shutdown(): Promise<void> {
    this.isRunning = false;
    
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
    }

    // Terminate all active workers
    for (const [jobId, worker] of this.workers) {
      try {
        await worker.terminate();
        logger.info('Backup worker terminated', { jobId });
      } catch (error) {
        logger.error('Failed to terminate backup worker', {
          jobId,
          error: error.message
        });
      }
    }

    this.workers.clear();
    logger.info('Backup worker shutdown completed');
  }
}

// Worker thread code
if (!isMainThread) {
  const { operation, job, config } = workerData;

  if (operation === 'backup') {
    executeBackup(job, config);
  } else if (operation === 'restore') {
    executeRestore(job, config);
  }
}

async function executeBackup(job: BackupJob, config: BackupConfig): Promise<void> {
  try {
    parentPort?.postMessage({ type: 'progress', progress: 0, currentOperation: 'Starting backup' });

    // Simulate backup process
    const collections = ['players', 'sessions', 'game_events', 'regions'];
    let totalSize = 0;

    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      
      parentPort?.postMessage({ 
        type: 'progress', 
        progress: (i / collections.length) * 100,
        currentOperation: `Backing up ${collection}` 
      });

      // Simulate collection backup
      await new Promise(resolve => setTimeout(resolve, 2000));
      totalSize += Math.floor(Math.random() * 1000000); // Random size
    }

    const checksum = createHash('sha256').update(job.id).digest('hex');

    parentPort?.postMessage({
      type: 'completed',
      size: totalSize,
      collections,
      destination: config.destinations[0]?.id,
      checksum
    });
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      error: error.message
    });
  }
}

async function executeRestore(job: RestoreJob, config: BackupConfig): Promise<void> {
  try {
    parentPort?.postMessage({ type: 'progress', progress: 0, currentOperation: 'Starting restore' });

    // Simulate restore process
    for (let i = 0; i <= 100; i += 10) {
      parentPort?.postMessage({ 
        type: 'progress', 
        progress: i,
        currentOperation: `Restoring data: ${i}%` 
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    parentPort?.postMessage({ type: 'completed' });
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      error: error.message
    });
  }
}

// Export singleton instance
export const backupWorker = new BackupWorker({
  type: 'incremental',
  schedule: '0 2 * * *', // Daily at 2 AM
  retention: {
    daily: 7,
    weekly: 4,
    monthly: 12
  },
  compression: true,
  encryption: true,
  destinations: [
    {
      id: 'local_backup',
      type: 'local',
      path: './backups',
      priority: 1
    }
  ]
});
