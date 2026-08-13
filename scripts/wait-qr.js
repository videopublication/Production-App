const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`⏳ Polling GET /instance/connect/${instance} for QR Code...\n`);

    for (let i = 1; i <= 10; i++) {
        try {
            const res = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
                headers: { 'apikey': globalApiKey }
            });
            const data = await res.json();
            console.log(`[Attempt ${i}] Output:`, JSON.stringify(data));

            if (data.base64 || data.code || data.pairingCode) {
                console.log("\n🎉 GOT QR CODE / PAIRING CODE!");
                if (data.pairingCode) console.log("Pairing Code:", data.pairingCode);
                return;
            }
        } catch (e) {
            console.log(`[Attempt ${i}] Error:`, e.message);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

main();
