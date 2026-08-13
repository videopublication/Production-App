const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`Checking state & QR for '${instance}'...\n`);

    try {
        const res = await fetch(`${gatewayUrl}/instance/fetchInstances`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Fetch Instances Result:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
