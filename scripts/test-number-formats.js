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

async function testNumber(label, numberVal) {
    console.log(`Testing [${label}]: ${numberVal}...`);
    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/message/sendText/${instance}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': globalApiKey
            },
            body: JSON.stringify({
                number: numberVal,
                options: {
                    delay: 1200
                },
                textMessage: {
                    text: `Test message to ${label}`
                }
            })
        });

        const text = await res.text();
        console.log(`--> Status: ${res.status} | Output: ${text}\n`);
    } catch (e) {
        console.error(`--> Error: ${e.message}\n`);
    }
}

async function main() {
    await testNumber('Owner Direct WhatsApp Number', '919310216809');
    await testNumber('Group JID (Legacy with @g.us)', '919122567619-1574169982@g.us');
    await testNumber('Group JID (Legacy without @g.us)', '919122567619-1574169982');
    await testNumber('Group JID (Modern with @g.us)', '120363424310845566@g.us');
}

main();
