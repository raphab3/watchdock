import nodemailer from 'nodemailer';
import { EmailConfig, MetricsReport } from '../../types';
import { EmailProvider } from '../email';

jest.mock('nodemailer');

describe('EmailProvider', () => {
  const mockTransporter = {
    sendMail: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
  });

  const mockConfig: EmailConfig = {
    type: 'email',
    host: 'smtp.test.com',
    port: 587,
    secure: true,
    auth: {
      user: 'test@test.com',
      pass: 'password',
    },
    from: 'sender@test.com',
    to: ['recipient1@test.com', 'recipient2@test.com'],
  };

  const mockReport: MetricsReport = {
    timestamp: '2024-01-01T00:00:00.000Z',
    status: 'healthy',
    errors: [],
    system: {
      cpu: {
        usage: 25.5,
        count: 4,
        loadAvg: [1.5, 1.0, 0.5],
      },
      memory: {
        total: 16000000000,
        free: 8000000000,
        used: 8000000000,
        heapTotal: 200000000,
        heapUsed: 100000000,
        external: 50000000,
        rss: 300000000,
      },
      disk: {
        total: 1000000000000,
        free: 500000000000,
        used: 500000000000,
        usedPercentage: 50,
      },
      process: {
        uptime: 3600,
        pid: 1234,
        version: 'v16.0.0',
      },
    },
    application: {
      activeConnections: 100,
      requestCount: 1000,
      errorCount: 5,
      averageResponseTime: 150,
    },
  };

  it('should initialize with correct configuration', () => {
    new EmailProvider(mockConfig);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: mockConfig.host,
      port: mockConfig.port,
      secure: mockConfig.secure,
      auth: mockConfig.auth,
    });
  });

  it('should send email with correct format for healthy status', async () => {
    const provider = new EmailProvider(mockConfig);
    await provider.send(mockReport);

    const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
    expect(emailContent).toContain('<strong>Status:</strong> HEALTHY');
    expect(emailContent).toMatch(/CPU: 25\.50%/);
    expect(emailContent).toMatch(/Active Connections: 100/);
    expect(emailContent).not.toContain('<h3>Errors</h3>');
  });

  it('should include errors in email when present', async () => {
    const reportWithErrors = {
      ...mockReport,
      status: 'unhealthy' as const,
      errors: ['CPU threshold exceeded', 'Memory usage too high'],
    };

    const provider = new EmailProvider(mockConfig);
    await provider.send(reportWithErrors);

    const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
    expect(emailContent).toContain('<strong>Status:</strong> UNHEALTHY');
    expect(emailContent).toContain('CPU threshold exceeded');
    expect(emailContent).toContain('Memory usage too high');
  });

  it('should handle email sending errors', async () => {
    mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const provider = new EmailProvider(mockConfig);

    await expect(provider.send(mockReport)).rejects.toThrow(
      'Failed to send email notification: SMTP error',
    );
  });
});
