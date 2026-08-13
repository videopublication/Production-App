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
const searchKeyword = (process.argv[2] || '').toLowerCase();

async function main() {
    console.log(`🔍 Fetching Group Titles for instance '${instance}' from ${gatewayUrl}...\n`);

    try {
        const chatsRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/findChats/${instance}`, {
            headers: { 'apikey': apiKey }
        });

        if (!chatsRes.ok) {
            console.error('❌ Failed to fetch chats:', chatsRes.status);
            return;
        }

        const chats = await chatsRes.json();
        const groupChats = chats.filter(c => (c.id || c.remoteJid || '').endsWith('@g.us'));

        console.log(`Found ${groupChats.length} Group JIDs. Resolving names (this may take a few seconds)...\n`);

        const results = [];

        for (const g of groupChats) {
            const jid = g.id || g.remoteJid;
            let name = g.name || g.subject || g.pushName;

            // Try fetching group metadata if name is missing
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

            if (!searchKeyword || finalName.toLowerCase().includes(searchKeyword) || jid.includes(searchKeyword)) {
                results.push({ name: finalName, jid });
            }
        }

        console.log('='.repeat(85));
        console.log(`${'GROUP NAME'.padEnd(35)} | ${'GROUP JID'}`);
        console.log('='.repeat(85));

        results.forEach(r => {
            console.log(`${r.name.slice(0, 34).padEnd(35)} | ${r.jid}`);
        });

        console.log('='.repeat(85));
        if (searchKeyword) {
            console.log(`\nFiltered by keyword: "${searchKeyword}" (${results.length} matches)`);
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
