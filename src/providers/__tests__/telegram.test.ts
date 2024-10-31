import { TelegramProvider } from '../telegram';
import { MetricsReport, TelegramConfig } from '../../types';
import axios, { AxiosError } from 'axios';

jest.mock('axios');

describe('TelegramProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (axios.post as jest.Mock).mockResolvedValue({ data: { ok: true } });
  });

  const mockConfig: TelegramConfig = {
    type: 'telegram',
    botToken: 'mock-bot-token',
    chatId: 'mock-chat-id',
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

  it('should format message correctly for healthy status', async () => {
    const provider = new TelegramProvider(mockConfig);
    await provider.send(mockReport);

    const sentMessage = (axios.post as jest.Mock).mock.calls[0][1].text;
    expect(sentMessage).toContain('✅ HEALTHY');
    expect(sentMessage).toContain('CPU: 25.50%');
    expect(sentMessage).toContain('Active Connections: 100');
    expect(sentMessage).not.toContain('⚠️ Errors');
  });

  it('should format message correctly for unhealthy status with errors', async () => {
    const reportWithErrors = {
      ...mockReport,
      status: 'unhealthy' as const,
      errors: ['CPU threshold exceeded', 'Memory usage too high'],
    };

    const provider = new TelegramProvider(mockConfig);
    await provider.send(reportWithErrors);

    const sentMessage = (axios.post as jest.Mock).mock.calls[0][1].text;
    expect(sentMessage).toContain('❌ UNHEALTHY');
    expect(sentMessage).toContain('⚠️ Errors:');
    expect(sentMessage).toContain('CPU threshold exceeded');
    expect(sentMessage).toContain('Memory usage too high');
  });

  it('should send message to correct Telegram endpoint', async () => {
    const provider = new TelegramProvider(mockConfig);
    await provider.send(mockReport);

    expect(axios.post).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${mockConfig.botToken}/sendMessage`,
      {
        chat_id: mockConfig.chatId,
        text: expect.any(String),
        parse_mode: 'HTML',
      },
    );
  });

  it('should handle Telegram API errors', async () => {
    const mockError = Object.assign(new AxiosError(), {
      message: 'Telegram API error',
    });

    (axios.post as jest.Mock).mockRejectedValueOnce(mockError);

    const provider = new TelegramProvider(mockConfig);

    await expect(provider.send(mockReport)).rejects.toThrow(
      'Failed to send Telegram notification: Telegram API error',
    );
  });

  it('should format status emojis correctly for all states', async () => {
    const provider = new TelegramProvider(mockConfig);
    const statusTests = [
      { status: 'healthy' as const, expected: '✅ HEALTHY' },
      { status: 'degraded' as const, expected: '⚠️ DEGRADED' },
      { status: 'unhealthy' as const, expected: '❌ UNHEALTHY' },
    ];

    for (const test of statusTests) {
      await provider.send({ ...mockReport, status: test.status });
      const sentMessage = (axios.post as jest.Mock).mock.calls.at(-1)[1].text;
      expect(sentMessage).toContain(test.expected);
    }
  });

  it('should handle missing application metrics gracefully', async () => {
    const reportWithoutMetrics = {
      ...mockReport,
      application: {},
    };

    const provider = new TelegramProvider(mockConfig);
    await provider.send(reportWithoutMetrics);

    const sentMessage = (axios.post as jest.Mock).mock.calls[0][1].text;
    expect(sentMessage).toContain('Active Connections: N/A');
    expect(sentMessage).toContain('Request Count: N/A');
    expect(sentMessage).toContain('Error Count: N/A');
    expect(sentMessage).toContain('Avg Response Time: N/A');
  });
});
