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
    console.log(`🔍 Fetching real Group Names for instance '${instance}'...\n`);

    try {
        const chatsRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/findChats/${instance}`, {
            headers: { 'apikey': apiKey }
        });

        if (!chatsRes.ok) return console.error('Failed to fetch chats');

        const chats = await chatsRes.json();
        const groupChats = chats.filter(c => (c.id || c.remoteJid || '').endsWith('@g.us'));

        console.log(`Found ${groupChats.length} groups. Resolving group names:\n`);
        console.log('='.repeat(90));
        console.log(`${'INDEX'.padEnd(6)} | ${'GROUP NAME'.padEnd(45)} | ${'GROUP JID'}`);
        console.log('='.repeat(90));

        let index = 1;
        for (const g of groupChats) {
            const jid = g.id || g.remoteJid;
            let name = g.name || g.subject;

            if (!name || name === 'Unnamed Group') {
                try {
                    const infoRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/group/findGroupInfos/${instance}?groupJid=${jid}`, {
                        headers: { 'apikey': apiKey }
                    });
                    if (infoRes.ok) {
                        const info = await infoRes.json();
                        name = info.subject || info.name || info.groupSubject;
                    }
                } catch (e) {}
            }

            console.log(`${String(index++).padEnd(6)} | ${(name || 'Group (' + jid.slice(0,10) + ')').padEnd(45)} | ${jid}`);
        }
        console.log('='.repeat(90));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
