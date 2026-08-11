const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BOT_SECRET = process.env.BOT_SECRET || '';

let sock;
let currentQrBase64 = null;
let connectionStatus = 'initializing';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

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
            console.log('   OR OPEN IN BROWSER: http://localhost:3001/qr');
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
                    <p>Your local gateway is active and ready to send messages.</p>
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
                    .card { background: #111b21; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
                    p { color: #8696a0; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Initializing WhatsApp Socket...</h2>
                    <p>Please wait a moment while the QR code is generated...</p>
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
                img { width: 280px; height: 280px; border-radius: 12px; border: 6px solid white; margin: 20px 0; }
                h2 { margin: 0; font-size: 20px; }
                p { color: #8696a0; font-size: 14px; margin-top: 8px; }
                .instructions { background: #202c33; padding: 12px; border-radius: 8px; font-size: 13px; color: #e9edef; text-align: left; margin-top: 16px; }
                .instructions ol { margin: 8px 0 0 20px; padding: 0; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Scan with WhatsApp</h2>
                <img src="${currentQrBase64}" alt="WhatsApp QR Code" />
                <div class="instructions">
                    <strong>Instructions:</strong>
                    <ol>
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap Menu (⋮) or Settings</li>
                        <li>Select <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong> & scan</li>
                    </ol>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Send Group Message Endpoint (Custom Gateway Format)
app.post('/send-group-message', async (req, res) => {
    const { groupJid, message, mentions, secret } = req.body;

    if (BOT_SECRET && secret !== BOT_SECRET) {
        return res.status(401).json({ error: 'Unauthorized: Invalid secret' });
    }

    if (!groupJid || !message) {
        return res.status(400).json({ error: 'Missing groupJid or message' });
    }

    if (!sock || connectionStatus !== 'connected') {
        return res.status(503).json({ error: 'WhatsApp client is initializing or disconnected' });
    }

    try {
        // Auto-detect mentions formatted like @91XXXXXXXXXX in text
        const detectedMentions = (message.match(/@\d{10,15}/g) || []).map(m => `${m.replace('@', '')}@s.whatsapp.net`);
        const formattedExplicitMentions = (mentions || []).map(m => m.includes('@') ? m : `${m}@s.whatsapp.net`);
        const finalMentions = Array.from(new Set([...formattedExplicitMentions, ...detectedMentions]));

        const messagePayload = { text: message };
        if (finalMentions.length > 0) {
            messagePayload.mentions = finalMentions;
        }

        await sock.sendMessage(groupJid, messagePayload);
        console.log(`[WhatsApp Gateway] Dispatched message to group: ${groupJid} with mentions: ${finalMentions.join(', ')}`);
        return res.json({ success: true, groupJid, mentions: finalMentions });
    } catch (err) {
        console.error('[WhatsApp Gateway] Failed to send message:', err);
        return res.status(500).json({ error: err.message || 'Failed to send message' });
    }
});

// Evolution API Compatibility Endpoint
app.post('/message/sendText/:instance', async (req, res) => {
    const { number, text, textMessage, mentions } = req.body;
    const msgContent = text || textMessage?.text || textMessage;

    if (!number || !msgContent) {
        return res.status(400).json({ error: 'Missing number or text' });
    }

    if (!sock || connectionStatus !== 'connected') {
        return res.status(503).json({ error: 'WhatsApp client is initializing or disconnected' });
    }

    try {
        const detectedMentions = (msgContent.match(/@\d{10,15}/g) || []).map(m => `${m.replace('@', '')}@s.whatsapp.net`);
        const formattedExplicitMentions = (mentions || []).map(m => m.includes('@') ? m : `${m}@s.whatsapp.net`);
        const finalMentions = Array.from(new Set([...formattedExplicitMentions, ...detectedMentions]));

        const messagePayload = { text: msgContent };
        if (finalMentions.length > 0) {
            messagePayload.mentions = finalMentions;
        }

        await sock.sendMessage(number, messagePayload);
        console.log(`[WhatsApp Gateway] Dispatched message to: ${number} with mentions: ${finalMentions.join(', ')}`);
        return res.json({ status: 'SUCCESS', key: { id: Date.now() }, mentions: finalMentions });
    } catch (err) {
        console.error('[WhatsApp Gateway] Failed to send message:', err);
        return res.status(500).json({ error: err.message || 'Failed to send message' });
    }
});

// Send Native WhatsApp Poll Endpoint
app.post('/send-poll', async (req, res) => {
    const { groupJid, pollName, options, selectableCount, secret } = req.body;

    if (BOT_SECRET && secret !== BOT_SECRET) {
        return res.status(401).json({ error: 'Unauthorized: Invalid secret' });
    }

    if (!groupJid || !pollName || !options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'Missing groupJid, pollName, or options (minimum 2 options required)' });
    }

    if (!sock || connectionStatus !== 'connected') {
        return res.status(503).json({ error: 'WhatsApp client is initializing or disconnected' });
    }

    try {
        await sock.sendMessage(groupJid, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: selectableCount || 1
            }
        });
        console.log(`[WhatsApp Gateway] Dispatched Poll "${pollName}" to group: ${groupJid}`);
        return res.json({ success: true, groupJid, pollName, optionsCount: options.length });
    } catch (err) {
        console.error('[WhatsApp Gateway] Failed to send poll:', err);
        return res.status(500).json({ error: err.message || 'Failed to send poll' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 [WhatsApp Gateway] Listening on port ${PORT}`);
});

