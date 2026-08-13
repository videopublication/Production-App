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

async function main() {
    console.log(`🔍 Checking instances on ${gatewayUrl}...\n`);

    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/instance/fetchInstances`, {
            headers: { 'apikey': apiKey }
        });

        if (!res.ok) {
            console.error('❌ Failed:', res.status, await res.text());
            return;
        }

        const instances = await res.json();
        console.log('Live Instances Found:\n', JSON.stringify(instances, null, 2));
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
