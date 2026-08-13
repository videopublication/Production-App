const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`🔍 Fetching QR code / connection state for '${instance}'...\n`);

    try {
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Connect Response:", JSON.stringify(data, null, 2));

        if (data.base64) {
            console.log("\n✅ Base64 QR Code received!");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
