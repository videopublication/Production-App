const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnv = (key) => {
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].replace(/['"]/g, '').trim() : '';
};

const gatewayUrl = getEnv('WHATSAPP_GATEWAY_URL') || 'https://vp-app-whatsapp-gateway.onrender.com';
const apiKey = getEnv('WHATSAPP_EVOLUTION_API_KEY') || 'qm0d4dfhj1ho95ajshj95p';
const globalApiKey = 'vp_app_secret_key_2026';
const instance = 'vp-app';
const groupJid = getEnv('WHATSAPP_GROUP_JID') || '120363424310845566@g.us';

async function testEndpoint(url, headers, body) {
    console.log(`Testing POST ${url}...`);
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

    // Format 1: /message/sendText/vp-app with instance apikey
    await testEndpoint(`${gatewayUrl}/message/sendText/${instance}`, { 'apikey': apiKey }, {
        number: groupJid,
        text: message
    });

    // Format 2: /message/sendText/vp-app with global apikey
    await testEndpoint(`${gatewayUrl}/message/sendText/${instance}`, { 'apikey': globalApiKey }, {
        number: groupJid,
        text: message
    });

    // Format 3: /message/sendText with instance in body & global apikey
    await testEndpoint(`${gatewayUrl}/message/sendText`, { 'apikey': globalApiKey }, {
        instance: instance,
        number: groupJid,
        text: message
    });

    // Format 4: /message/sendText with textMessage object
    await testEndpoint(`${gatewayUrl}/message/sendText/${instance}`, { 'apikey': globalApiKey }, {
        number: groupJid,
        textMessage: { text: message }
    });
}

main();
