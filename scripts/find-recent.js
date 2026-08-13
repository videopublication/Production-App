const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnv = (key) => {
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].replace(/['"]/g, '').trim() : '';
};

const gatewayUrl = getEnv('WHATSAPP_GATEWAY_URL') || 'https://vp-app-whatsapp-gateway.onrender.com';
const apiKey = getEnv('WHATSAPP_EVOLUTION_API_KEY') || 'vp_app_secret_key_2026';
const instance = 'vp-app';

async function main() {
    console.log(`🔍 Searching recent chats for instance '${instance}'...\n`);

    try {
        const chatsRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/findChats/${instance}`, {
            headers: { 'apikey': apiKey }
        });

        if (!chatsRes.ok) {
            console.error('❌ Failed to fetch chats:', chatsRes.status);
            return;
        }

        const chats = await chatsRes.json();

        // Sort by conversationTimestamp descending (most recent first)
        const sorted = chats.sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0));

        const groupChats = sorted.filter(c => (c.id || c.remoteJid || '').endsWith('@g.us'));

        console.log('Top 15 Most Recently Updated WhatsApp Groups:\n');
        console.log('='.repeat(95));
        console.log(`${'GROUP NAME / UNREAD'.padEnd(35)} | ${'LAST MSG TIME'.padEnd(20)} | ${'GROUP JID'}`);
        console.log('='.repeat(95));

        for (const g of groupChats.slice(0, 15)) {
            const jid = g.id || g.remoteJid;
            let name = g.name || g.subject || g.pushName;

            if (!name || name === 'Unnamed Group') {
                try {
                    const metaRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/group/findGroupInfos/${instance}?groupJid=${jid}`, {
                        headers: { 'apikey': apiKey }
                    });
                    if (metaRes.ok) {
                        const meta = await metaRes.json();
                        name = meta.subject || meta.name || name;
                    }
                } catch (e) {}
            }

            const finalName = name || 'Unnamed Group';
            const ts = g.conversationTimestamp ? new Date(g.conversationTimestamp * 1000).toLocaleTimeString() : 'N/A';

            console.log(`${finalName.slice(0, 34).padEnd(35)} | ${ts.padEnd(20)} | ${jid}`);
        }

        console.log('='.repeat(95));
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
