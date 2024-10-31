import * as os from "os";
import { SystemMonitor } from "../../monitor";
import { MonitorConfig, MetricsReport } from "../../types";
import { TelegramProvider } from "../../providers/telegram";
import { EmailProvider } from "../../providers/email";
import { getDiskInfo } from "../disk";

// Mocks
jest.mock("os");
jest.mock("node-cron");
jest.mock("../disk");
jest.mock("../../providers/telegram");
jest.mock("../../providers/email");

describe("SystemMonitor", () => {
  const mockTelegramProvider = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockEmailProvider = {
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

    jest.spyOn(process, "memoryUsage").mockReturnValue(mockMemoryUsage);

    (TelegramProvider as jest.Mock).mockImplementation(
      () => mockTelegramProvider
    );
    (EmailProvider as jest.Mock).mockImplementation(() => mockEmailProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("Initialization", () => {
    it("should initialize with correct providers", () => {
      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [
          { type: "telegram", botToken: "token", chatId: "chat" },
          {
            type: "email",
            host: "smtp.test.com",
            port: 587,
            secure: true,
            auth: { user: "test", pass: "pass" },
            from: "from@test.com",
            to: ["to@test.com"],
          },
        ],
      };

      new SystemMonitor(config);

      expect(TelegramProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "telegram",
          botToken: "token",
          chatId: "chat",
        })
      );
      expect(EmailProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "email",
          host: "smtp.test.com",
          port: 587,
        })
      );
    });
  });

  describe("Notification Rules", () => {
    it("should not send notification when metrics are below thresholds", async () => {
      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [{ type: "telegram", botToken: "token", chatId: "chat" }],
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
      await monitor["collectSystemMetrics"]();

      expect(mockTelegramProvider.send).not.toHaveBeenCalled();
    });

    it("should send notification when metrics exceed thresholds", async () => {
      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [{ type: "telegram", botToken: "token", chatId: "chat" }],
        notifications: {
          cpu: {
            value: 1, // CPU is mocked at 1.5
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      await monitor["collectSystemMetrics"]();

      expect(mockTelegramProvider.send).toHaveBeenCalled();
    });

    it("should respect notification duration", async () => {
      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [{ type: "telegram", botToken: "token", chatId: "chat" }],
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
      await monitor["collectSystemMetrics"]();
      expect(mockTelegramProvider.send).toHaveBeenCalledTimes(1);

      // Second check immediately after
      await monitor["collectSystemMetrics"]();
      expect(mockTelegramProvider.send).toHaveBeenCalledTimes(1); // Shouldn't send again

      // Advance time by 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Third check after duration
      await monitor["collectSystemMetrics"]();
      expect(mockTelegramProvider.send).toHaveBeenCalledTimes(2); // Should send again
    });

    it("should handle custom notification rules", async () => {
      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [{ type: "telegram", botToken: "token", chatId: "chat" }],
        notifications: {
          custom: [
            {
              condition: (metrics: MetricsReport) =>
                metrics.system.cpu.usage > 1,
              message: "Custom CPU alert",
            },
          ],
        },
      };

      const monitor = new SystemMonitor(config);
      await monitor["collectSystemMetrics"]();

      const sentReport = mockTelegramProvider.send.mock.calls[0][0];
      expect(sentReport.errors).toContain("Custom CPU alert");
    });

    it("should send notifications based on status", async () => {
      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [{ type: "telegram", botToken: "token", chatId: "chat" }],
        notifications: {
          status: {
            notifyOn: ["degraded", "unhealthy"],
          },
          cpu: {
            value: 1,
            notify: true,
          },
        },
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor["collectSystemMetrics"]();

      expect(report.status).toBe("degraded");
      expect(mockTelegramProvider.send).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle async custom metrics failure gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const mockMetrics = jest
        .fn()
        .mockRejectedValue(new Error("Custom metrics error"));

      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [],
        customMetrics: mockMetrics,
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor["collectSystemMetrics"]();

      expect(report).toBeDefined();
      expect(report.application).toEqual({});
      expect(mockMetrics).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to collect custom metrics:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should handle sync custom metrics failure gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const mockMetrics = jest.fn().mockImplementation(() => {
        throw new Error("Sync custom metrics error");
      });

      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [],
        customMetrics: mockMetrics,
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor["collectSystemMetrics"]();

      expect(report).toBeDefined();
      expect(report.application).toEqual({});
      expect(mockMetrics).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to collect custom metrics:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Metrics Collection", () => {
    it("should collect system metrics correctly", async () => {
      const config: MonitorConfig = {
        interval: "*/5 * * * *",
        providers: [],
        customMetrics: jest.fn().mockResolvedValue({
          activeConnections: 100,
          requestCount: 1000,
        }),
      };

      const monitor = new SystemMonitor(config);
      const report = await monitor["collectSystemMetrics"]();

      expect(report).toMatchObject({
        status: "healthy",
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
});
