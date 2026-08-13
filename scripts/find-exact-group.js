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
    console.log(`🔍 Searching for exact group 'vp aap testing'...\n`);

    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/findChats/${instance}`, {
            headers: { 'apikey': apiKey }
        });

        if (!res.ok) return console.error('Failed to fetch chats');

        const chats = await res.json();
        const groups = chats.filter(c => (c.id || c.remoteJid || '').endsWith('@g.us'));

        console.log(`Searching across ${groups.length} group chats...`);

        for (const g of groups) {
            const jid = g.id || g.remoteJid;
            
            // Try group info
            try {
                const infoRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/group/findGroupInfos/${instance}?groupJid=${jid}`, {
                    headers: { 'apikey': apiKey }
                });
                if (infoRes.ok) {
                    const info = await infoRes.json();
                    const title = info.subject || info.name || '';
                    if (title.toLowerCase().includes('aap') || title.toLowerCase().includes('vp')) {
                        console.log(`🎯 FOUND GROUP: "${title}" -> JID: ${jid}`);
                    }
                }
            } catch (e) {}
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
