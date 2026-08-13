const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`🔄 Re-creating instance '${instance}' fresh...\n`);

    try {
        // Delete old instance
        await fetch(`${gatewayUrl}/instance/delete/${instance}`, {
            method: 'DELETE',
            headers: { 'apikey': globalApiKey }
        });

        // Create fresh
        const createRes = await fetch(`${gatewayUrl}/instance/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': globalApiKey
            },
            body: JSON.stringify({
                instanceName: instance,
                token: "qm0d4dfhj1ho95ajshj95p",
                qrcode: true,
                integration: "WHATSAPP-BAILEYS"
            })
        });

        const data = await createRes.json();
        console.log("Create Fresh Result:", JSON.stringify(data, null, 2));

        // Connect
        const connRes = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });
        console.log("\nConnect Result:", JSON.stringify(await connRes.json(), null, 2));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
