const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";
const phoneNumber = "919310216809";

async function main() {
    console.log(`📱 Requesting 8-Digit Pairing Code for '${phoneNumber}' on instance '${instance}'...\n`);

    try {
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}?number=${phoneNumber}`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Response:", JSON.stringify(data, null, 2));

        if (data.pairingCode || data.code) {
            console.log(`\n🎉 YOUR PAIRING CODE: ${data.pairingCode || data.code}`);
        } else if (data.base64) {
            console.log("\n✅ QR Code Base64 generated!");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
