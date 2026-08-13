const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`Testing POST /instance/connect/${instance}...`);
    try {
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': globalApiKey
            }
        });
        const text = await res.text();
        console.log(`Status: ${res.status} | Response: ${text}`);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
