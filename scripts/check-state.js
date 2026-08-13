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

async function main() {
    console.log(`🔍 Checking Connection State for instance '${instance}'...\n`);

    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/instance/connectionState/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log('Connection State Result:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
