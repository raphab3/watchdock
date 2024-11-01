import * as os from 'os';
import { DiscordProvider } from './providers/discord';
import { EmailProvider } from './providers/email';
import { getDiskInfo } from './utils/disk';
import {
  ApplicationConfig,
  MetricsReport,
  MonitorConfig,
  NotificationProvider,
  NotificationRules,
  ThresholdConfig,
} from './types';
import { schedule } from 'node-cron';
import { TelegramProvider } from './providers/telegram';

export class SystemMonitor {
  private config: MonitorConfig;
  private providers: NotificationProvider[] = [];
  private lastNotificationTime: { [key: string]: number } = {};

  constructor(config: MonitorConfig) {
    this.config = config;
    this.setupProviders();
  }

  private setupProviders() {
    this.config.providers.forEach((providerConfig) => {
      switch (providerConfig.type) {
        case 'telegram':
          this.providers.push(new TelegramProvider(providerConfig));
          break;
        case 'email':
          this.providers.push(new EmailProvider(providerConfig));
          break;
        case 'discord':
          this.providers.push(new DiscordProvider(providerConfig));
          break;
      }
    });
  }

  private shouldNotify(metric: string, value: number): boolean {
    const rules = this.config.notifications;
    if (!rules) return false;

    const threshold = rules[metric as keyof NotificationRules] as ThresholdConfig;
    if (!threshold || !threshold.notify) return false;

    const now = Date.now();
    const lastNotification = this.lastNotificationTime[metric] || 0;
    const durationMs = (threshold.duration || 0) * 60 * 1000;

    if (value > threshold.value && (!threshold.duration || now - lastNotification >= durationMs)) {
      this.lastNotificationTime[metric] = now;
      return true;
    }

    return false;
  }

  private async collectSystemMetrics(): Promise<MetricsReport> {
    const cpuUsage = os.loadavg()[0] || 0;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const disk = await getDiskInfo();
    const memoryUsage = process.memoryUsage();

    let applicationMetrics = {};
    if (this.config.customMetrics) {
      try {
        const metrics = this.config.customMetrics();
        applicationMetrics = metrics instanceof Promise ? await metrics : metrics;
      } catch (error) {
        console.error('Failed to collect custom metrics:', error);
      }
    }

    const errors: string[] = [];
    const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;

    if (this.shouldNotify('cpu', cpuUsage)) {
      errors.push(
        `CPU usage (${cpuUsage.toFixed(1)}%) exceeds threshold of ${
          this.config.notifications?.cpu?.value
        }%`,
      );
    }

    if (this.shouldNotify('memory', memoryUsagePercent)) {
      errors.push(
        `Memory usage (${memoryUsagePercent.toFixed(
          1,
        )}%) exceeds threshold of ${this.config.notifications?.memory?.value}%`,
      );
    }

    if (this.shouldNotify('disk', disk.usedPercentage)) {
      errors.push(
        `Disk usage (${disk.usedPercentage.toFixed(1)}%) exceeds threshold of ${
          this.config.notifications?.disk?.value
        }%`,
      );
    }

    if (this.config.notifications?.custom) {
      for (const rule of this.config.notifications.custom) {
        const metrics: MetricsReport = {
          timestamp: new Date().toISOString(),
          status: errors.length === 0 ? 'healthy' : errors.length < 2 ? 'degraded' : 'unhealthy',
          errors: [],
          system: {
            cpu: {
              usage: cpuUsage,
              count: os.cpus().length,
              loadAvg: os.loadavg(),
            },
            memory: {
              total: totalMemory,
              free: freeMemory,
              used: totalMemory - freeMemory,
              heapTotal: memoryUsage.heapTotal,
              heapUsed: memoryUsage.heapUsed,
              external: memoryUsage.external,
              rss: memoryUsage.rss,
            },
            disk,
            process: {
              uptime: process.uptime(),
              pid: process.pid,
              version: process.version,
            },
          },
          application: applicationMetrics,
        };

        if (rule.condition(metrics)) {
          errors.push(rule.message);
        }
      }
    }

    const status = errors.length === 0 ? 'healthy' : errors.length < 2 ? 'degraded' : 'unhealthy';

    const shouldNotifyStatus =
      this.config.notifications?.status?.notifyOn.includes(status) ?? false;

    const report: MetricsReport = {
      timestamp: new Date().toISOString(),
      status,
      errors,
      system: {
        cpu: {
          usage: cpuUsage,
          count: os.cpus().length,
          loadAvg: os.loadavg(),
        },
        memory: {
          total: totalMemory,
          free: freeMemory,
          used: totalMemory - freeMemory,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
        },
        disk,
        process: {
          uptime: process.uptime(),
          pid: process.pid,
          version: process.version,
        },
      },
      application: applicationMetrics,
    };

    const app = this.config.application;

    if (errors.length > 0 || shouldNotifyStatus) {
      await this.sendNotifications(report, app);
    }

    return report;
  }

  private async sendNotifications(report: MetricsReport, app?: ApplicationConfig) {
    const appConfig = app || this.config.application;

    await Promise.all(
      this.providers.map((provider) =>
        provider
          .send(report, appConfig)
          .catch((error) => console.error(`Failed to send notification: ${error.message}`)),
      ),
    );
  }

  public start(): void {
    schedule(this.config.interval, async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        console.error('Monitor error:', error);
      }
    });
  }
}

class Watchdock extends SystemMonitor {}

export default Watchdock;
