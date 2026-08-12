const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BOT_SECRET = process.env.BOT_SECRET || '';

// Supabase session backup configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_ltZ9QJUHcxamcNYjuLSnWA_NKB_2NtK';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('[WhatsApp Gateway] Supabase session persistence enabled for URL:', SUPABASE_URL);
    } catch (e) {
        console.warn('[WhatsApp Gateway] Failed to initialize Supabase client:', e.message);
    }
}

let sock;
let currentQrBase64 = null;
let connectionStatus = 'initializing';

const AUTH_DIR = path.join(__dirname, 'auth_info');

async function restoreSessionFromSupabase() {
    if (!supabase) return;
    try {
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        const { data, error } = await supabase.from('whatsapp_sessions').select('id, data');
        if (error) {
            console.warn('[WhatsApp Gateway] Failed to fetch session backup from Supabase:', error.message);
            return;
        }

        if (data && data.length > 0) {
            console.log(`[WhatsApp Gateway] Restoring ${data.length} auth session files from Supabase DB...`);
            for (const row of data) {
                const filePath = path.join(AUTH_DIR, row.id);
                const fileContent = typeof row.data === 'string' ? row.data : JSON.stringify(row.data);
                fs.writeFileSync(filePath, fileContent);
            }
            console.log('✅ [WhatsApp Gateway] Session files restored successfully from Supabase!');
        }
    } catch (err) {
        console.error('[WhatsApp Gateway] Error restoring session from Supabase:', err.message);
    }
}

async function backupSessionToSupabase() {
    if (!supabase || !fs.existsSync(AUTH_DIR)) return;
    try {
        const files = fs.readdirSync(AUTH_DIR);
        const rows = [];

        for (const file of files) {
            const filePath = path.join(AUTH_DIR, file);
            if (fs.statSync(filePath).isFile()) {
                const content = fs.readFileSync(filePath, 'utf8');
                try {
                    const parsed = JSON.parse(content);
                    rows.push({ id: file, data: parsed, updated_at: new Date().toISOString() });
                } catch {
                    rows.push({ id: file, data: { raw: content }, updated_at: new Date().toISOString() });
                }
            }
        }

        if (rows.length > 0) {
            const { error } = await supabase.from('whatsapp_sessions').upsert(rows);
            if (error) {
                console.warn('[WhatsApp Gateway] Failed to back up session files to Supabase:', error.message);
            } else {
                console.log(`[WhatsApp Gateway] Backed up ${rows.length} session files to Supabase DB!`);
            }
        }
    } catch (err) {
        console.error('[WhatsApp Gateway] Error backing up session to Supabase:', err.message);
    }
}

async function connectToWhatsApp() {
    await restoreSessionFromSupabase();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        backupSessionToSupabase().catch(() => {});
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            connectionStatus = 'qr_ready';
            try {
                currentQrBase64 = await QRCode.toDataURL(qr);
            } catch (err) {
                console.error('[WhatsApp Gateway] Failed to generate QR image:', err.message);
            }
            console.log('\n==================================================');
            console.log('📱 SCAN THIS QR CODE IN WHATSAPP (LINKED DEVICES)');
            console.log('   OR OPEN IN BROWSER: /qr');
            console.log('==================================================\n');
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'close') {
            currentQrBase64 = null;
            connectionStatus = 'disconnected';
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[WhatsApp Gateway] Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            currentQrBase64 = null;
            connectionStatus = 'connected';
            console.log('\n==================================================');
            console.log('✅ [WhatsApp Gateway] CONNECTED SUCCESSFULLY TO WHATSAPP!');
            console.log('==================================================\n');
            backupSessionToSupabase().catch(() => {});
        }
    });
}

connectToWhatsApp();

// Healthcheck Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', connected: connectionStatus === 'connected', state: connectionStatus });
});

// Browser QR Code Page
app.get(['/', '/qr'], (req, res) => {
    if (connectionStatus === 'connected') {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp Gateway - Connected</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b141a; color: white; margin: 0; }
                    .card { background: #111b21; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 400px; width: 90%; }
                    .icon { font-size: 64px; margin-bottom: 16px; }
                    h2 { margin: 0 0 8px 0; color: #25d366; }
                    p { color: #8696a0; margin: 0; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✅</div>
                    <h2>WhatsApp Connected!</h2>
                    <p>Your WhatsApp gateway session is 24/7 active and backed up to cloud DB.</p>
                </div>
            </body>
            </html>
        `);
    }

    if (!currentQrBase64) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp Gateway - Initializing</title>
                <meta http-equiv="refresh" content="3">
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b141a; color: white; margin: 0; }
                    .card { background: #111b21; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 400px; width: 90%; }
                    .spinner { border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #25d366; border-radius: 50%; width: 48px; height: 48px; animation: spin 1s linear infinite; margin: 0 auto 16px auto; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    h2 { margin: 0 0 8px 0; color: white; }
                    p { color: #8696a0; margin: 0; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="spinner"></div>
                    <h2>Generating QR Code...</h2>
                    <p>Please wait a moment while the connection initializes.</p>
                </div>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Scan WhatsApp QR Code</title>
            <meta http-equiv="refresh" content="15">
            <style>
                body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b141a; color: white; margin: 0; }
                .card { background: #111b21; padding: 32px; border-radius: 16px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 360px; width: 90%; }
                h2 { margin: 0 0 8px 0; color: white; }
                p { color: #8696a0; margin: 0 0 20px 0; font-size: 14px; }
                img { width: 260px; height: 260px; border-radius: 12px; background: white; padding: 12px; }
                .steps { text-align: left; background: #202c33; padding: 12px 16px; border-radius: 8px; margin-top: 20px; font-size: 12px; color: #d1d7db; }
                .steps ol { margin: 0; padding-left: 20px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Scan WhatsApp QR</h2>
                <p>Link your WhatsApp account to enable automated dispatches</p>
                <img src="${currentQrBase64}" alt="WhatsApp QR Code" />
                <div class="steps">
                    <ol>
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap Menu (⋮) or Settings</li>
                        <li>Select Linked Devices &gt; Link a Device</li>
                    </ol>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Send Group Message API
app.post(['/send-group-message', '/message/sendText/vp-app-1'], async (req, res) => {
    try {
        if (BOT_SECRET && req.headers['x-bot-secret'] !== BOT_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (connectionStatus !== 'connected' || !sock) {
            return res.status(503).json({ error: 'WhatsApp Gateway not connected to WhatsApp' });
        }

        const { groupJid, number, message, text, mentions } = req.body;
        const targetJid = groupJid || number || process.env.WHATSAPP_GROUP_JID || '120363424310845566@g.us';
        const msgText = message || text;

        if (!msgText) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        const options = {};
        if (mentions && Array.isArray(mentions) && mentions.length > 0) {
            options.mentions = mentions;
        }

        await sock.sendMessage(targetJid, { text: msgText, ...options });
        console.log(`[WhatsApp Gateway] Dispatched message to target JID: ${targetJid}`);
        return res.json({ success: true, targetJid });
    } catch (err) {
        console.error('[WhatsApp Gateway] Failed to send message:', err);
        return res.status(500).json({ error: err.message || 'Failed to send WhatsApp message' });
    }
});

// Send Interactive Poll API
app.post(['/send-poll', '/message/sendPoll/vp-app-1'], async (req, res) => {
    try {
        if (BOT_SECRET && req.headers['x-bot-secret'] !== BOT_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (connectionStatus !== 'connected' || !sock) {
            return res.status(503).json({ error: 'WhatsApp Gateway not connected to WhatsApp' });
        }

        const { groupJid, pollName, options, selectableCount } = req.body;
        const targetJid = groupJid || process.env.WHATSAPP_GROUP_JID || '120363424310845566@g.us';

        if (!pollName || !options || !Array.isArray(options) || options.length < 2) {
            return res.status(400).json({ error: 'Poll name and at least 2 options are required' });
        }

        await sock.sendMessage(targetJid, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: selectableCount || 1
            }
        });
        console.log(`[WhatsApp Gateway] Dispatched Poll "${pollName}" to group: ${targetJid}`);
        return res.json({ success: true, targetJid, pollName, optionsCount: options.length });
    } catch (err) {
        console.error('[WhatsApp Gateway] Failed to send poll:', err);
        return res.status(500).json({ error: err.message || 'Failed to send poll' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 [WhatsApp Gateway] Listening on port ${PORT}`);
});
