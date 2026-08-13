const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app-1";
const phoneNumber = "919310216809";

async function main() {
    console.log(`Testing /instance/pairingCode/${instance}...`);
    try {
        const res = await fetch(`${gatewayUrl}/instance/pairingCode/${instance}?number=${phoneNumber}`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Response:", res.status, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
