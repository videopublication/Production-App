const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app-1";
const phoneNumber = "919310216809";

async function main() {
    console.log(`📱 Requesting Pairing Code for '${phoneNumber}' on instance '${instance}'...\n`);

    try {
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}?number=${phoneNumber}`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Connect Response:", JSON.stringify(data, null, 2));

        const code = data.pairingCode || data.code || data.qrcode?.pairingCode;
        if (code) {
            console.log(`\n🎉 YOUR 8-DIGIT PAIRING CODE IS: ${code}`);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
