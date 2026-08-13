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
const instance = getEnv('WHATSAPP_EVOLUTION_INSTANCE') || 'vp-app';
const groupJid = getEnv('WHATSAPP_GROUP_JID');

async function main() {
    const message = `Namaskaram 🙏\n\n🎬 *VP PRODUCTION APP AUTOMATION TEST* 🎬\n\nAutomated WhatsApp Group messaging is now live and working!\n\nPranam 🙏`;

    console.log(`🚀 Sending test WhatsApp message to Group JID '${groupJid}'...\n`);

    try {
        const endpoint = `${gatewayUrl.replace(/\/$/, '')}/message/sendText/${instance}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey,
            },
            body: JSON.stringify({
                number: groupJid,
                options: {
                    delay: 1200,
                    presence: "composing",
                    linkPreview: false
                },
                textMessage: {
                    text: message
                },
                text: message
            }),
        });

        const data = await response.text();
        console.log(`Status: ${response.status}`);
        console.log('Response:', data);
    } catch (err) {
        console.error('❌ Error sending message:', err.message);
    }
}

main();
