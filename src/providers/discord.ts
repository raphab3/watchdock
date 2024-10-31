import axios, { AxiosError } from 'axios';
import { DiscordConfig, MetricsReport, NotificationProvider } from '../types';

export class DiscordProvider implements NotificationProvider {
  private config: DiscordConfig;

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  private getStatusColor(status: 'healthy' | 'degraded' | 'unhealthy'): number {
    const colors = {
      healthy: 0x00ff00,
      degraded: 0xffa500,
      unhealthy: 0xff0000,
    };

    return colors[status];
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  private formatMessage(report: MetricsReport): {
    username: string;
    avatar_url?: string;
    embeds: Array<{
      title: string;
      color: number;
      description: string;
      timestamp: string;
      fields: Array<{ name: string; value: string; inline: boolean }>;
      footer: { text: string };
    }>;
  } {
    const { system, application, status, timestamp, errors } = report;

    const fields = [
      {
        name: '💻 CPU',
        value: [
          `Usage: ${system.cpu.usage.toFixed(2)}%`,
          `Cores: ${system.cpu.count}`,
          `Load Average: ${system.cpu.loadAvg.map((v) => v.toFixed(2)).join(', ')}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🧠 Memory',
        value: [
          `Used: ${this.formatBytes(system.memory.used)}`,
          `Free: ${this.formatBytes(system.memory.free)}`,
          `Total: ${this.formatBytes(system.memory.total)}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '💾 Disk',
        value: [
          `Used: ${system.disk.usedPercentage}%`,
          `Free: ${this.formatBytes(system.disk.free)}`,
          `Total: ${this.formatBytes(system.disk.total)}`,
        ].join('\n'),
        inline: true,
      },
    ];

    const hasApplicationMetrics = Object.values(application).some(
      (value) => value !== null && value !== undefined && value !== 'N/A',
    );

    if (hasApplicationMetrics) {
      fields.push({
        name: '📊 Application Metrics',
        value: [
          application.activeConnections
            ? `Active Connections: ${application.activeConnections}`
            : null,
          application.requestCount ? `Request Count: ${application.requestCount}` : null,
          application.errorCount ? `Error Count: ${application.errorCount}` : null,
          application.averageResponseTime
            ? `Avg Response Time: ${application.averageResponseTime}ms`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
        inline: false,
      });
    }

    if (errors.length > 0) {
      fields.push({
        name: '⚠️ Errors',
        value: errors.join('\n'),
        inline: false,
      });
    }

    return {
      username: this.config.username || 'System Monitor',
      avatar_url: this.config.avatarUrl || '',
      embeds: [
        {
          title: '🔍 System Health Report',
          color: this.getStatusColor(status),
          description: `**Status:** ${status.toUpperCase()}`,
          timestamp: timestamp,
          fields,
          footer: {
            text: `Process ID: ${system.process.pid} | Uptime: ${Math.floor(
              system.process.uptime / 3600,
            )}h ${Math.floor((system.process.uptime % 3600) / 60)}m`,
          },
        },
      ],
    };
  }

  async send(report: MetricsReport): Promise<void> {
    try {
      const message = this.formatMessage(report);
      await axios.post(this.config.webhookUrl, message);
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to send Discord notification: ${error.message}`);
      }
      throw new Error('Failed to send Discord notification: Unknown error');
    }
  }
}
