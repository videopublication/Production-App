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

const os = require('os');
const AUTH_DIR = process.env.AUTH_DIR || path.join(os.tmpdir(), 'vp_whatsapp_auth_info');

async function restoreSessionFromSupabase() {
    if (!supabase) return;
    try {
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        } else {
            const existingFiles = fs.readdirSync(AUTH_DIR);
            if (existingFiles.length > 0) {
                console.log('[WhatsApp Gateway] Active local session files found. Skipping restore to preserve live keys.');
                return;
            }
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

let isConnecting = false;

async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    try {
        if (sock) {
            try {
                sock.ev.removeAllListeners();
                sock.end(undefined);
            } catch {}
            sock = null;
        }

        await restoreSessionFromSupabase();

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['VP Production App', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 3000,
            markOnlineOnConnect: false,
            syncFullHistory: false
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
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
                const isConflict = statusCode === 440;

                console.log(`[WhatsApp Gateway] Connection closed (code ${statusCode}). Logged out: ${isLoggedOut}, Conflict: ${isConflict}`);

                if (isLoggedOut) {
                    currentQrBase64 = null;
                    connectionStatus = 'disconnected';
                    console.log('[WhatsApp Gateway] Logged out / invalid session. Wiping auth state...');
                    if (fs.existsSync(AUTH_DIR)) {
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    }
                    if (supabase) {
                        try {
                            await supabase.from('whatsapp_sessions').delete().neq('id', 'keep_table_alive');
                        } catch {}
                    }
                    setTimeout(connectToWhatsApp, 3000);
                } else if (isConflict) {
                    console.warn('[WhatsApp Gateway] Session conflict (code 440). Delaying reconnect to allow primary session to settle...');
                    setTimeout(connectToWhatsApp, 15000);
                } else {
                    console.log('[WhatsApp Gateway] Temporary connection hiccup. Reconnecting seamlessly...');
                    setTimeout(connectToWhatsApp, 5000);
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
    } finally {
        isConnecting = false;
    }
}

connectToWhatsApp();

// Healthcheck Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', connected: connectionStatus === 'connected', state: connectionStatus });
});

// Force Reset & Clear Session Endpoint
app.all(['/reset', '/force-qr'], async (req, res) => {
    try {
        console.log('[WhatsApp Gateway] Force reset requested. Clearing all auth keys...');
        if (sock) {
            try { sock.logout(); } catch {}
            try { sock.end(); } catch {}
            sock = null;
        }

        currentQrBase64 = null;
        connectionStatus = 'disconnected';

        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }

        if (supabase) {
            try {
                await supabase.from('whatsapp_sessions').delete().neq('id', 'keep_table_alive');
            } catch {}
        }

        setTimeout(() => {
            connectToWhatsApp().catch(console.error);
        }, 1000);

        return res.json({ success: true, message: 'Gateway session reset cleanly. Fresh QR generating.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
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
                    a { color: #25d366; text-decoration: none; font-size: 13px; font-weight: bold; margin-top: 16px; inline-block: true; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✅</div>
                    <h2>WhatsApp Connected!</h2>
                    <p>Your WhatsApp gateway session is 24/7 active and backed up to cloud DB.</p>
                    <br/>
                    <a href="/reset">🔌 Logout / Reset Session</a>
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
                    p { color: #8696a0; margin: 0 0 16px 0; }
                    a { color: #25d366; text-decoration: none; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="spinner"></div>
                    <h2>Generating QR Code...</h2>
                    <p>Please wait a moment while the connection initializes.</p>
                    <a href="/reset">Click here if stuck to force reset session</a>
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

// Disconnect & Logout Session API
app.post(['/logout', '/disconnect'], async (req, res) => {
    try {
        console.log('[WhatsApp Gateway] Disconnect/Logout requested. Resetting session...');
        if (sock) {
            try {
                await sock.logout();
            } catch {
                try { sock.end(); } catch {}
            }
            sock = null;
        }

        currentQrBase64 = null;
        connectionStatus = 'disconnected';

        // Clear local auth directory
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }

        // Clear Supabase session storage table
        if (supabase) {
            try {
                await supabase.from('whatsapp_sessions').delete().neq('id', 'keep_table_alive');
            } catch {}
        }

        // Restart listener for fresh QR code
        setTimeout(() => {
            connectToWhatsApp().catch(console.error);
        }, 1000);

        return res.json({ success: true, message: 'WhatsApp session logged out & reset successfully. New QR code generating.' });
    } catch (err) {
        console.error('[WhatsApp Gateway] Failed to logout session:', err);
        return res.status(500).json({ error: err.message || 'Failed to disconnect session' });
    }
});

let cachedGroups = null;
let lastGroupsFetchTime = 0;
const GROUPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

// Helper function to fetch groups with timeout
async function fetchGroupsWithTimeout(timeoutMs = 8000) {
    if (!sock) return null;
    return Promise.race([
        sock.groupFetchAllParticipating(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Group fetch timeout')), timeoutMs))
    ]);
}

// List Joined WhatsApp Groups API
app.get(['/groups', '/group/list'], async (req, res) => {
    try {
        const now = Date.now();
        // Serve from cache if fresh
        if (cachedGroups && (now - lastGroupsFetchTime < GROUPS_CACHE_TTL_MS)) {
            return res.json({ success: true, groups: cachedGroups, cached: true });
        }

        if (connectionStatus === 'connected' && sock) {
            try {
                const groups = await fetchGroupsWithTimeout(8000);
                if (groups) {
                    cachedGroups = Object.values(groups).map((g) => ({
                        id: g.id,
                        subject: g.subject,
                        participantsCount: g.participants?.length || 0,
                        creation: g.creation
                    }));
                    lastGroupsFetchTime = now;
                    return res.json({ success: true, groups: cachedGroups });
                }
            } catch (fetchErr) {
                console.warn('[WhatsApp Gateway] Live group fetch error/timeout:', fetchErr.message);
                if (cachedGroups) {
                    console.log('[WhatsApp Gateway] Serving fallback cached groups.');
                    return res.json({ success: true, groups: cachedGroups, fallback: true });
                }
            }
        }

        // If not connected but have cache
        if (cachedGroups) {
            return res.json({ success: true, groups: cachedGroups, fallback: true });
        }

        return res.json({ success: true, groups: [], note: 'Connecting to WhatsApp...' });
    } catch (err) {
        console.error('[WhatsApp Gateway] Error in /groups endpoint:', err.message);
        if (cachedGroups) {
            return res.json({ success: true, groups: cachedGroups, fallback: true });
        }
        return res.status(500).json({ error: err.message || 'Failed to fetch groups' });
    }
});

// Send Group Message API
app.post(['/send-group-message', '/message/sendText/vp-app-1'], async (req, res) => {
    try {
        if (BOT_SECRET && req.headers['x-bot-secret'] !== BOT_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { groupJid, number, message, text, mentions } = req.body;
        const targetJid = groupJid || number || process.env.WHATSAPP_GROUP_JID || '120363424310845566@g.us';
        const msgText = message || text;

        if (!msgText) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        const options = {};
        let finalMentions = Array.isArray(mentions) ? [...mentions] : [];

        // Auto-extract any @phone tags in text for live WhatsApp group tagging
        if (msgText) {
            const matches = msgText.match(/@(\d{10,13})/g);
            if (matches) {
                matches.forEach(m => {
                    const num = m.replace('@', '');
                    const jid = num.length === 10 ? `91${num}@s.whatsapp.net` : `${num}@s.whatsapp.net`;
                    if (!finalMentions.includes(jid)) finalMentions.push(jid);
                });
            }
        }

        if (finalMentions.length > 0) {
            options.mentions = finalMentions;
        }

        let sent = false;
        let lastError = null;

        // Try sending with up to 3 attempts and auto-reconnect if socket is settling
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (connectionStatus !== 'connected' || !sock) {
                    console.log(`[WhatsApp Gateway] Send attempt ${attempt}: Socket not connected, waiting for connection...`);
                    await new Promise(r => setTimeout(r, 2000));
                }

                if (sock) {
                    await sock.sendMessage(targetJid, { text: msgText, ...options });
                    sent = true;
                    console.log(`[WhatsApp Gateway] Dispatched message on attempt ${attempt} to target JID: ${targetJid}`);
                    break;
                }
            } catch (err) {
                lastError = err;
                console.warn(`[WhatsApp Gateway] Send attempt ${attempt} failed:`, err.message);
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }

        if (!sent) {
            throw lastError || new Error('Failed to dispatch message after 3 attempts');
        }

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

process.on('uncaughtException', (err) => {
    console.error('[WhatsApp Gateway] Uncaught Exception:', err.message || err);
    if (err.message && (err.message.includes('Connection Closed') || err.message.includes('Stream Errored'))) {
        console.log('[WhatsApp Gateway] Recovering from socket error, reconnecting in 3s...');
        setTimeout(() => {
            try { connectToWhatsApp(); } catch (e) { console.error('Reconnect failed:', e); }
        }, 3000);
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('[WhatsApp Gateway] Unhandled Rejection:', reason?.message || reason);
});

app.listen(PORT, () => {
    console.log(`🚀 [WhatsApp Gateway] Listening on port ${PORT}`);
});
