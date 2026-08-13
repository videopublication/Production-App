const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnv = (key) => {
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].replace(/['"]/g, '').trim() : '';
};

const gatewayUrl = getEnv('WHATSAPP_GATEWAY_URL') || 'https://vp-app-whatsapp-gateway.onrender.com';
const globalApiKey = 'vp_app_secret_key_2026';
const instance = 'vp-app';

async function sendGroup(groupJid, label) {
    const message = `Namaskaram 🙏\n\n🎬 *VP PRODUCTION APP AUTOMATION TEST* 🎬\n\nAutomated WhatsApp Group messaging is live and working!\n\nPranam 🙏`;

    console.log(`🚀 Sending message to group [${label}]: ${groupJid}...`);

    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/message/sendText/${instance}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': globalApiKey
            },
            body: JSON.stringify({
                number: groupJid,
                textMessage: {
                    text: message
                }
            })
        });

        const text = await res.text();
        console.log(`--> Status: ${res.status} | Response: ${text}\n`);
    } catch (e) {
        console.error(`--> Error: ${e.message}\n`);
    }
}

async function main() {
    await sendGroup('919122567619-1574169982@g.us', 'VP App Testing (Legacy JID)');
    await sendGroup('120363424310845566@g.us', 'VP App Testing (Modern JID)');
}

main();
