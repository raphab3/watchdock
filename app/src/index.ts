import express, { Request, Response } from 'express';
import { SystemMonitor } from 'watchdock';

const app = express();
const port = 3000;

app.use(express.json());

const API_TELEGRAM_TOKEN = '';
const API_TELEGRAM_CHAT_ID = '';
const DISCORD_WEBHOOK_URL = '';
const DISCORD_WEBHOOK_URL_V2 = '';
const monitor = new SystemMonitor({
  interval: '*/1 * * * *',
  application: {
    name: 'HAMORA API',
    metadata: {
      version: '1.0.0',
    },
  },
  providers: [
    {
      type: 'discord',
      webhookUrl: DISCORD_WEBHOOK_URL,
    },
    {
      type: 'discord',
      webhookUrl: DISCORD_WEBHOOK_URL_V2,
    },
    {
      type: 'telegram',
      botToken: API_TELEGRAM_TOKEN,
      chatId: API_TELEGRAM_CHAT_ID,
    },
  ],
  notifications: {
    cpu: {
      value: 80,
      duration: 5,
      notify: true,
    },
    memory: {
      value: 90,
      notify: true,
    },
    disk: {
      value: 40,
      notify: true,
    },
    status: {
      notifyOn: ['unhealthy', 'degraded'],
    },
  },
});

monitor.start();

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello World!' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
