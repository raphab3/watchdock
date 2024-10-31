import { NotificationProvider, MetricsReport, EmailConfig } from '../types';
import nodemailer from 'nodemailer';

export class EmailProvider implements NotificationProvider {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }

  private formatHtmlMessage(report: MetricsReport): string {
    const { system, application, status, timestamp } = report;

    return `
      <h2>System Health Report</h2>
      <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
      <p><strong>Status:</strong> ${status.toUpperCase()}</p>
      
      <h3>System Metrics</h3>
      <ul>
        <li>CPU: ${system.cpu.usage.toFixed(2)}%</li>
        <li>Memory: ${(system.memory.used / 1024 / 1024).toFixed(2)} MB</li>
        <li>Heap: ${(system.memory.heapUsed / 1024 / 1024).toFixed(2)} MB</li>
        <li>Disk: ${system.disk.usedPercentage}%</li>
      </ul>
      
      <h3>Application Metrics</h3>
      <ul>
        <li>Active Connections: ${application.activeConnections || 'N/A'}</li>
        <li>Request Count: ${application.requestCount || 'N/A'}</li>
        <li>Error Count: ${application.errorCount || 'N/A'}</li>
        <li>Avg Response Time: ${application.averageResponseTime || 'N/A'}ms</li>
      </ul>
      
      ${
        report.errors?.length
          ? `
        <h3>Errors</h3>
        <ul>
          ${report.errors.map((error) => `<li>${error}</li>`).join('')}
        </ul>
      `
          : ''
      }
    `;
  }

  async send(report: MetricsReport): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to.join(', '),
        subject: `System Health Report - ${report.status.toUpperCase()}`,
        html: this.formatHtmlMessage(report),
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send email notification: ${error.message}`);
      }
      throw new Error('Failed to send email notification: Unknown error');
    }
  }
}
