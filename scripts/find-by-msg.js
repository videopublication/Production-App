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
    console.log(`🔍 Searching chats for 'vp app testing'...\n`);

    try {
        // Fetch all group chats
        const chatsRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/findChats/${instance}`, {
            headers: { 'apikey': apiKey }
        });

        if (!chatsRes.ok) return console.error('Failed to fetch chats');
        const chats = await chatsRes.json();
        const groupChats = chats.filter(c => (c.id || c.remoteJid || '').endsWith('@g.us'));

        console.log(`Checking last messages for ${groupChats.length} group chats...`);

        for (const g of groupChats) {
            const jid = g.id || g.remoteJid;
            
            // Check if name contains search
            if (g.name && g.name.toLowerCase().includes('vp')) {
                console.log(`\n🎉 MATCH BY NAME: "${g.name}" -> JID: ${jid}`);
            }

            // Fetch last message for group
            try {
                const msgRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/findMessages/${instance}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': apiKey
                    },
                    body: JSON.stringify({
                        where: { key: { remoteJid: jid } },
                        limit: 3
                    })
                });

                if (msgRes.ok) {
                    const messages = await msgRes.json();
                    const msgsList = Array.isArray(messages) ? messages : (messages.messages?.records || messages.records || []);
                    
                    for (const m of msgsList) {
                        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || '';
                        if (text) {
                            console.log(`Group (${jid.slice(0, 15)}...): Last message -> "${text}"`);
                            if (text.toLowerCase().includes('test') || text.toLowerCase().includes('vp')) {
                                console.log(`👉 MATCH FOUND IN GROUP MSG! JID: ${jid}`);
                            }
                            break;
                        }
                    }
                }
            } catch (e) {}
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
