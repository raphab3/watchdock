import * as os from 'os';
import { EmailProvider } from '../providers/email';
import { TelegramProvider } from '../providers/telegram';
import { MonitorConfig, MetricsReport } from '../types';
import { getDiskInfo } from '../utils/disk';
import { SystemMonitor } from '..';
import { DiscordProvider } from '../providers/discord';

// Mocks
jest.mock('os');
jest.mock('node-cron');
jest.mock('../utils/disk');
jest.mock('../providers/telegram');
jest.mock('../providers/email');
jest.mock('../providers/discord');

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

const { schedule } = jest.requireMock('node-cron');

describe('SystemMonitor', () => {
  const mockTelegramProvider = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockEmailProvider = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockDiscordProvider = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock system values
    (os.loadavg as jest.Mock).mockReturnValue([1.5, 1.0, 0.5]);
    (os.totalmem as jest.Mock).mockReturnValue(16000000000); // 16GB
    (os.freemem as jest.Mock).mockReturnValue(8000000000); // 8GB
    (os.cpus as jest.Mock).mockReturnValue(Array(4).fill({}));
    (getDiskInfo as jest.Mock).mockResolvedValue({
      total: 1000000000000, // 1TB
      free: 500000000000, // 500GB
      used: 500000000000,
      usedPercentage: 50,
    });

    const mockMemoryUsage = {
      heapTotal: 200000000,
      heapUsed: 100000000,
      external: 50000000,
      rss: 300000000,
      arrayBuffers: 10000000,
    };

    jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);

    (TelegramProvider as jest.Mock).mockImplementation(() => mockTelegramProvider);
    (EmailProvider as jest.Mock).mockImplementation(() => mockEmailProvider);
    (DiscordProvider as jest.Mock).mockImplementation(() => mockDiscordProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with correct providers', () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        application: {
          name: 'Test App',
          metadata: {
            version: '1.0.0',
            environment: 'production',
          },
        },
        providers: [
          { type: 'telegram', botToken: 'token', chatId: 'chat' },
          {
            type: 'email',
            host: 'smtp.test.com',
            port: 587,
            secure: true,
            auth: { user: 'test', pass: 'pass' },
            from: 'from@test.com',
            to: ['to@test.com'],
          },
          {
            type: 'discord',
            webhookUrl: 'https://discord.webhook.url',
            username: 'Test Bot',
            avatarUrl: 'https://test.avatar.url',
          },
        ],
      };

      new SystemMonitor(config);

      expect(TelegramProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'telegram',
          botToken: 'token',
          chatId: 'chat',
        }),
      );
      expect(EmailProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'email',
          host: 'smtp.test.com',
          port: 587,
        }),
      );
      expect(DiscordProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'discord',
          webhookUrl: 'https://discord.webhook.url',
          username: 'Test Bot',
          avatarUrl: 'https://test.avatar.url',
        }),
      );
    });
  });

  describe('Notification Rules', () => {
    it('should not send notification when metrics are below thresholds', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
        notifications: {
          cpu: {
            value: 90,
            notify: true,
          },
          memory: {
            value: 90,
            notify: true,
          },
          disk: {
            value: 90,
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      await monitor['collectSystemMetrics']();

      expect(mockTelegramProvider.send).not.toHaveBeenCalled();
    });

    it('should send notification when metrics exceed thresholds', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
        notifications: {
          cpu: {
            value: 1, // CPU is mocked at 1.5
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      await monitor['collectSystemMetrics']();

      expect(mockTelegramProvider.send).toHaveBeenCalled();
    });

    it('should respect notification duration', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
        notifications: {
          cpu: {
            value: 1,
            duration: 5, // 5 minutes
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);

      // First check
      await monitor['collectSystemMetrics']();
      expect(mockTelegramProvider.send).toHaveBeenCalledTimes(1);

      // Second check immediately after
      await monitor['collectSystemMetrics']();
      expect(mockTelegramProvider.send).toHaveBeenCalledTimes(1); // Shouldn't send again

      // Advance time by 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Third check after duration
      await monitor['collectSystemMetrics']();
      expect(mockTelegramProvider.send).toHaveBeenCalledTimes(2); // Should send again
    });

    it('should handle custom notification rules', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
        notifications: {
          custom: [
            {
              condition: (metrics: MetricsReport) => metrics.system.cpu.usage > 1,
              message: 'Custom CPU alert',
            },
          ],
        },
      };

      const monitor = new SystemMonitor(config);
      await monitor['collectSystemMetrics']();

      const sentReport = mockTelegramProvider.send.mock.calls[0][0];
      expect(sentReport.errors).toContain('Custom CPU alert');
    });

    it('should send notifications based on status', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
        notifications: {
          status: {
            notifyOn: ['degraded', 'unhealthy'],
          },
          cpu: {
            value: 1,
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor['collectSystemMetrics']();

      expect(report.status).toBe('degraded');
      expect(mockTelegramProvider.send).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle async custom metrics failure gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockMetrics = jest.fn().mockRejectedValue(new Error('Custom metrics error'));

      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [],
        customMetrics: mockMetrics,
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor['collectSystemMetrics']();

      expect(report).toBeDefined();
      expect(report.application).toEqual({});
      expect(mockMetrics).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to collect custom metrics:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should handle sync custom metrics failure gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockMetrics = jest.fn().mockImplementation(() => {
        throw new Error('Sync custom metrics error');
      });

      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [],
        customMetrics: mockMetrics,
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor['collectSystemMetrics']();

      expect(report).toBeDefined();
      expect(report.application).toEqual({});
      expect(mockMetrics).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to collect custom metrics:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Metrics Collection', () => {
    it('should collect system metrics correctly', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [],
        customMetrics: jest.fn().mockResolvedValue({
          activeConnections: 100,
          requestCount: 1000,
        }),
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor['collectSystemMetrics']();

      expect(report).toMatchObject({
        status: 'healthy',
        errors: expect.any(Array),
        system: {
          cpu: {
            usage: 1.5,
            count: 4,
            loadAvg: [1.5, 1.0, 0.5],
          },
          memory: {
            total: 16000000000,
            free: 8000000000,
            used: 8000000000,
          },
          disk: {
            total: 1000000000000,
            free: 500000000000,
            used: 500000000000,
            usedPercentage: 50,
          },
        },
        application: {
          activeConnections: 100,
          requestCount: 1000,
        },
      });
    });
  });

  describe('Monitor Start and Schedule', () => {
    it('should schedule metrics collection on start', () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
      };

      const monitor = new SystemMonitor(config);
      monitor.start();

      expect(schedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
    });

    it('should handle errors during metrics collection in scheduled execution', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (getDiskInfo as jest.Mock).mockRejectedValue(new Error('Disk info error'));

      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
      };

      const monitor = new SystemMonitor(config);
      monitor.start();

      // Pegue o callback diretamente da chamada do schedule
      const callback = (schedule as jest.Mock).mock.calls[0][1];
      await callback();

      expect(consoleSpy).toHaveBeenCalledWith('Monitor error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('Provider Notifications', () => {
    it('should handle failed notifications gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockTelegramProvider.send.mockRejectedValueOnce(new Error('Send failed'));

      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [
          { type: 'telegram', botToken: 'token', chatId: 'chat' },
          {
            type: 'email',
            host: 'smtp.test.com',
            port: 587,
            secure: true,
            auth: { user: 'test', pass: 'pass' },
            from: 'from@test.com',
            to: ['to@test.com'],
          },
        ],
        notifications: {
          cpu: {
            value: 1,
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      await monitor['collectSystemMetrics']();

      // Ajuste a verificação para a mensagem completa
      expect(consoleSpy).toHaveBeenCalledWith('Failed to send notification: Send failed');
      expect(mockEmailProvider.send).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Threshold Checks', () => {
    it('should handle multiple thresholds being exceeded', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
        notifications: {
          cpu: {
            value: 1,
            notify: true,
          },
          memory: {
            value: 40, // Memory usage is mocked at 50%
            notify: true,
          },
          disk: {
            value: 40, // Disk usage is mocked at 50%
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor['collectSystemMetrics']();

      expect(report.status).toBe('unhealthy');
      expect(report.errors).toHaveLength(3);
      expect(mockTelegramProvider.send).toHaveBeenCalledTimes(1);
    });

    it('should not notify when notify flag is false', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
        notifications: {
          cpu: {
            value: 1,
            notify: false,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor['collectSystemMetrics']();

      expect(report.errors).toHaveLength(0);
      expect(mockTelegramProvider.send).not.toHaveBeenCalled();
    });
  });

  describe('Monitor Configuration', () => {
    it('should handle empty providers array', () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [],
      };

      const monitor = new SystemMonitor(config);
      expect(() => monitor.start()).not.toThrow();
    });

    it('should handle missing notifications config', async () => {
      const config: MonitorConfig = {
        interval: '*/5 * * * *',
        providers: [{ type: 'telegram', botToken: 'token', chatId: 'chat' }],
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor['collectSystemMetrics']();

      expect(report.status).toBe('healthy');
      expect(report.errors).toHaveLength(0);
      expect(mockTelegramProvider.send).not.toHaveBeenCalled();
    });
  });
});
