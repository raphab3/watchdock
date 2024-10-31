import { DiscordProvider } from '../discord';
import { DiscordConfig, MetricsReport } from '../../types';
import axios, { AxiosError } from 'axios';

jest.mock('axios');

describe('DiscordProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (axios.post as jest.Mock).mockResolvedValue({ data: {} });
  });

  const mockConfig: DiscordConfig = {
    type: 'discord',
    webhookUrl: 'https://discord.com/api/webhooks/mock',
    username: 'Test Monitor',
    avatarUrl: 'https://example.com/avatar.png',
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
        total: 16000000000, // 16GB
        free: 8000000000, // 8GB
        used: 8000000000, // 8GB
        heapTotal: 200000000,
        heapUsed: 100000000,
        external: 50000000,
        rss: 300000000,
      },
      disk: {
        total: 1000000000000, // 1TB
        free: 500000000000, // 500GB
        used: 500000000000, // 500GB
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

  describe('Message Formatting', () => {
    it('should format healthy status message correctly', async () => {
      const provider = new DiscordProvider(mockConfig);
      await provider.send(mockReport);

      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];

      expect(sentMessage).toMatchObject({
        username: mockConfig.username,
        avatar_url: mockConfig.avatarUrl,
        embeds: [
          expect.objectContaining({
            title: '🔍 System Health Report',
            color: 0x00ff00, // Green color for healthy
            description: '**Status:** HEALTHY',
          }),
        ],
      });
    });

    it('should format system metrics fields correctly', async () => {
      const provider = new DiscordProvider(mockConfig);
      await provider.send(mockReport);

      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];
      const fields = sentMessage.embeds[0].fields;

      // CPU field
      expect(fields).toContainEqual(
        expect.objectContaining({
          name: '💻 CPU',
          value: expect.stringContaining('Usage: 25.50%'),
        }),
      );

      // Memory field
      expect(fields).toContainEqual(
        expect.objectContaining({
          name: '🧠 Memory',
          value: expect.stringContaining('Used: 7.45 GB'),
        }),
      );

      // Disk field
      expect(fields).toContainEqual(
        expect.objectContaining({
          name: '💾 Disk',
          value: expect.stringContaining('Used: 50%'),
        }),
      );
    });

    it('should format application metrics correctly', async () => {
      const provider = new DiscordProvider(mockConfig);
      await provider.send(mockReport);

      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];
      const appMetricsField = sentMessage.embeds[0].fields.find(
        (f: { name: string }) => f.name === '📊 Application Metrics',
      );

      expect(appMetricsField).toBeDefined();
      expect(appMetricsField.value).toContain('Active Connections: 100');
      expect(appMetricsField.value).toContain('Request Count: 1000');
      expect(appMetricsField.value).toContain('Error Count: 5');
      expect(appMetricsField.value).toContain('Avg Response Time: 150ms');
    });

    it('should handle missing application metrics', async () => {
      const reportWithoutMetrics = {
        ...mockReport,
        application: {},
      };

      const provider = new DiscordProvider(mockConfig);
      await provider.send(reportWithoutMetrics);

      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];
      const fields = sentMessage.embeds[0].fields;

      expect(fields.some((f: { name: string }) => f.name === '📊 Application Metrics')).toBeFalsy();
    });

    it('should format errors correctly', async () => {
      const reportWithErrors = {
        ...mockReport,
        status: 'unhealthy' as const,
        errors: ['CPU usage critical', 'Memory threshold exceeded'],
      };

      const provider = new DiscordProvider(mockConfig);
      await provider.send(reportWithErrors);

      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];
      const errorField = sentMessage.embeds[0].fields.find(
        (f: { name: string; value: string }) => f.name === '⚠️ Errors',
      );

      expect(errorField).toBeDefined();
      expect(errorField.value).toContain('CPU usage critical');
      expect(errorField.value).toContain('Memory threshold exceeded');
    });

    it('should use correct colors for different statuses', async () => {
      const provider = new DiscordProvider(mockConfig);
      const statusTests = [
        { status: 'healthy' as const, color: 0x00ff00 },
        { status: 'degraded' as const, color: 0xffa500 },
        { status: 'unhealthy' as const, color: 0xff0000 },
      ];

      for (const test of statusTests) {
        await provider.send({ ...mockReport, status: test.status });
        const sentMessage = (axios.post as jest.Mock).mock.calls.at(-1)[1];
        expect(sentMessage.embeds[0].color).toBe(test.color);
      }
    });

    it('should format bytes correctly for different sizes', async () => {
      const provider = new DiscordProvider(mockConfig);
      const reportWithVariousBytes = {
        ...mockReport,
        system: {
          ...mockReport.system,
          memory: {
            ...mockReport.system.memory,
            used: 1500000, // Deve mostrar como 1.43 MB
            free: 1500000000, // Deve mostrar como 1.40 GB
            total: 1500000000000, // Deve mostrar como 1.36 TB
          },
        },
      };

      await provider.send(reportWithVariousBytes);
      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];
      const memoryField = sentMessage.embeds[0].fields.find(
        (f: { name: string }) => f.name === '🧠 Memory',
      );

      expect(memoryField.value).toContain('1.43 MB');
      expect(memoryField.value).toContain('1.40 GB');
      expect(memoryField.value).toContain('1.36 TB');
    });
  });

  describe('Error Handling', () => {
    it('should handle Discord API errors', async () => {
      const mockError = Object.assign(new AxiosError(), {
        message: 'Discord API error',
      });

      (axios.post as jest.Mock).mockRejectedValueOnce(mockError);
      const provider = new DiscordProvider(mockConfig);

      await expect(provider.send(mockReport)).rejects.toThrow(
        'Failed to send Discord notification: Discord API error',
      );
    });

    it('should handle unknown errors', async () => {
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('Unknown error'));
      const provider = new DiscordProvider(mockConfig);

      await expect(provider.send(mockReport)).rejects.toThrow(
        'Failed to send Discord notification: Unknown error',
      );
    });

    it('should use default username when not provided', async () => {
      const configWithoutUsername: DiscordConfig = {
        type: 'discord',
        webhookUrl: 'https://discord.com/api/webhooks/mock',
      };

      const provider = new DiscordProvider(configWithoutUsername);
      await provider.send(mockReport);

      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];
      expect(sentMessage.username).toBe('System Monitor');
    });
  });

  describe('API Interaction', () => {
    it('should send message to correct webhook URL', async () => {
      const provider = new DiscordProvider(mockConfig);
      await provider.send(mockReport);

      expect(axios.post).toHaveBeenCalledWith(mockConfig.webhookUrl, expect.any(Object));
    });

    it('should include process uptime in footer', async () => {
      const provider = new DiscordProvider(mockConfig);
      await provider.send(mockReport);

      const sentMessage = (axios.post as jest.Mock).mock.calls[0][1];
      expect(sentMessage.embeds[0].footer.text).toContain('Process ID: 1234');
      expect(sentMessage.embeds[0].footer.text).toContain('Uptime: 1h 0m');
    });
  });
});
