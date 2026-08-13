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
    console.log(`🔍 Searching chats with unread / recent messages in '${instance}'...\n`);

    try {
        const chatsRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/findChats/${instance}`, {
            headers: { 'apikey': apiKey }
        });

        if (!chatsRes.ok) {
            console.error('❌ Failed to fetch chats:', chatsRes.status);
            return;
        }

        const chats = await chatsRes.json();
        const unreadGroupChats = chats.filter(c => (c.id || c.remoteJid || '').endsWith('@g.us') && (c.unreadCount > 0 || c.unread > 0));

        console.log(`Found ${unreadGroupChats.length} group chat(s) with unread messages:\n`);

        for (const g of unreadGroupChats) {
            const jid = g.id || g.remoteJid;
            let name = g.name || g.subject || g.pushName || 'Unnamed Group';

            try {
                const metaRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/group/findGroupInfos/${instance}?groupJid=${jid}`, {
                    headers: { 'apikey': apiKey }
                });
                if (metaRes.ok) {
                    const meta = await metaRes.json();
                    name = meta.subject || meta.name || name;
                }
            } catch (e) {}

            console.log(`📌 MATCH FOUND:`);
            console.log(`   Group Name: ${name}`);
            console.log(`   Group JID : ${jid}`);
            console.log(`   Unread    : ${g.unreadCount || g.unread}`);
            console.log('-'.repeat(60));
        }

        if (unreadGroupChats.length === 0) {
            console.log('No unread group messages found. Checking top 5 active chats:');
            const recent = chats.filter(c => (c.id || c.remoteJid || '').endsWith('@g.us')).slice(0, 5);
            for (const g of recent) {
                const jid = g.id || g.remoteJid;
                let name = g.name || g.subject || 'Unnamed Group';
                try {
                    const metaRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/group/findGroupInfos/${instance}?groupJid=${jid}`, {
                        headers: { 'apikey': apiKey }
                    });
                    if (metaRes.ok) {
                        const meta = await metaRes.json();
                        name = meta.subject || meta.name || name;
                    }
                } catch (e) {}
                console.log(`- ${name} -> JID: ${jid}`);
            }
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
