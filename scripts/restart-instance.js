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

async function main() {
    console.log(`🔄 Re-connecting instance '${instance}' on ${gatewayUrl}...\n`);

    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });

        const text = await res.text();
        console.log('Connect Response:', res.status, text);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
