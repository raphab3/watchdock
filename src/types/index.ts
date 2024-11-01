export interface SystemMetrics {
  cpu: {
    usage: number;
    count: number;
    loadAvg: number[];
  };
  memory: {
    total: number;
    free: number;
    used: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    rss: number;
  };
  disk: DiskInfo;
  process: {
    uptime: number;
    pid: number;
    version: string;
  };
}

export interface DiskInfo {
  total: number;
  free: number;
  used: number;
  usedPercentage: number;
}

export interface ApplicationMetrics {
  activeConnections?: number;
  requestCount?: number;
  errorCount?: number;
  averageResponseTime?: number;
  [key: string]: number | string | boolean | undefined;
}

export interface MetricsReport {
  timestamp: string;
  system: SystemMetrics;
  application: ApplicationMetrics;
  status: 'healthy' | 'degraded' | 'unhealthy';
  errors: string[];
}

export interface NotificationProvider {
  send(report: MetricsReport): Promise<void>;
}

export interface TelegramConfig {
  type: 'telegram';
  botToken: string;
  chatId: string;
}

export interface EmailConfig {
  type: 'email';
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  to: string[];
}

export interface DiscordConfig {
  type: 'discord';
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
}

export interface ThresholdConfig {
  value: number;
  duration?: number;
  notify?: boolean;
}

export interface NotificationRules {
  cpu?: ThresholdConfig;
  memory?: ThresholdConfig;
  disk?: ThresholdConfig;
  status?: {
    notifyOn: Array<'healthy' | 'degraded' | 'unhealthy'>;
  };
  custom?: {
    condition: (metrics: MetricsReport) => boolean;
    message: string;
  }[];
}

export type NotificationConfig = TelegramConfig | EmailConfig | DiscordConfig;

export interface ApplicationConfig {
  name: string;
  version?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface MonitorConfig {
  interval: string;
  providers: NotificationConfig[];
  customMetrics?: () => Promise<ApplicationMetrics>;
  notifications?: NotificationRules;
  application?: ApplicationConfig;
}
