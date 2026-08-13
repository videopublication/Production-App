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
const instanceApiKey = 'qm0d4dfhj1ho95ajshj95p';
const instance = 'vp-app';
const groupJid = getEnv('WHATSAPP_GROUP_JID') || '120363424310845566@g.us';

async function testCall(name, url, headers, body) {
    console.log(`Testing ${name}...`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body)
        });
        const text = await res.text();
        console.log(`--> Status: ${res.status} | Output: ${text}\n`);
    } catch (e) {
        console.error(`--> Error: ${e.message}\n`);
    }
}

async function main() {
    const message = "VP App Test Message";

    // 1. With global key & instance header
    await testCall('Global Key + Instance Header', `${gatewayUrl}/message/sendText/${instance}`, {
        'apikey': globalApiKey,
        'instance': instance
    }, {
        number: groupJid,
        textMessage: { text: message }
    });

    // 2. With instance key & instance header
    await testCall('Instance Key + Instance Header', `${gatewayUrl}/message/sendText/${instance}`, {
        'apikey': instanceApiKey,
        'instance': instance
    }, {
        number: groupJid,
        textMessage: { text: message }
    });

    // 3. Simple text body with global key
    await testCall('Global Key + Simple Body', `${gatewayUrl}/message/sendText/${instance}`, {
        'apikey': globalApiKey
    }, {
        number: groupJid,
        text: message
    });
}

main();
