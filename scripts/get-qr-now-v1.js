const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`Requesting QR Code from ${gatewayUrl}/instance/connect/${instance}...\n`);

    try {
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Connect Response:", JSON.stringify(data, null, 2));

        if (data.code || data.base64 || data.qrcode?.base64) {
            console.log("\n🎉 SUCCESS! QR CODE DATA IS ACTIVE!");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
