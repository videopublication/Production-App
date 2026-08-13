const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`🔍 Requesting QR Code generation for '${instance}'...\n`);

    try {
        // Step 1: Connect
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            method: 'GET',
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Connect Output:", JSON.stringify(data, null, 2));

        if (data.code || data.base64 || data.qrcode) {
            console.log("\n✅ SUCCESS: QR Code data generated!");
        } else {
            console.log("\nRetrying restart...");
            const restartRes = await fetch(`${gatewayUrl}/instance/restart/${instance}`, {
                method: 'PUT',
                headers: { 'apikey': globalApiKey }
            });
            console.log("Restart Output:", await restartRes.text());
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
