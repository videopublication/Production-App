const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instanceToken = "qm0d4dfhj1ho95ajshj95p";
const instance = "vp-app";
const number = "919310216809";

async function testKey(name, key) {
    console.log(`Testing connect with key [${name}]: ${key}...`);
    try {
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}?number=${number}`, {
            headers: { 'apikey': key }
        });
        const text = await res.text();
        console.log(`Status: ${res.status} | Response: ${text}\n`);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

async function main() {
    await testKey('Global API Key', globalApiKey);
    await testKey('Instance Token', instanceToken);
}

main();
