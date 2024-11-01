"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const watchdock_1 = require("watchdock");
const app = (0, express_1.default)();
const port = 3000;
app.use(express_1.default.json());
const API_TELEGRAM_TOKEN = '';
const API_TELEGRAM_CHAT_ID = '';
const DISCORD_WEBHOOK_URL = '';
const DISCORD_WEBHOOK_URL_V2 = '';
const monitor = new watchdock_1.SystemMonitor({
    interval: '*/1 * * * *',
    application: {
        name: 'My App',
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
app.get('/', (req, res) => {
    res.json({ message: 'Hello World!' });
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
