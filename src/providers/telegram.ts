import { NotificationProvider, MetricsReport, TelegramConfig } from '../types';
import axios, { AxiosError } from 'axios';

export class TelegramProvider implements NotificationProvider {
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  private formatMessage(report: MetricsReport): string {
    const { system, application, status, timestamp } = report;

    return `
🔍 System Health Report
📅 ${new Date(timestamp).toLocaleString()}
Status: ${this.getStatusEmoji(status)}

💻 System Metrics:
CPU: ${system.cpu.usage.toFixed(2)}%
Memory: ${(system.memory.used / 1024 / 1024).toFixed(2)} MB
Heap: ${(system.memory.heapUsed / 1024 / 1024).toFixed(2)} MB
Disk: ${system.disk.usedPercentage}%

📊 Application Metrics:
Active Connections: ${application.activeConnections || 'N/A'}
Request Count: ${application.requestCount || 'N/A'}
Error Count: ${application.errorCount || 'N/A'}
Avg Response Time: ${application.averageResponseTime || 'N/A'}ms

${report.errors?.length ? `⚠️ Errors:\n${report.errors.join('\n')}` : ''}
    `.trim();
  }

  private getStatusEmoji(status: 'healthy' | 'degraded' | 'unhealthy'): string {
    const emojis = {
      healthy: '✅',
      degraded: '⚠️',
      unhealthy: '❌',
    } as const;

    return `${emojis[status]} ${status.toUpperCase()}`;
  }

  async send(report: MetricsReport): Promise<void> {
    const message = this.formatMessage(report);
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: this.config.chatId,
        text: message,
        parse_mode: 'HTML',
      });
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to send Telegram notification: ${error.message}`);
      }
      throw new Error('Failed to send Telegram notification: Unknown error');
    }
  }
}
