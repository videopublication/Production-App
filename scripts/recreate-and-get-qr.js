const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";
const number = "919310216809";

async function main() {
    console.log(`🔄 Deleting and recreating instance '${instance}' for QR generation...\n`);

    try {
        // Delete
        await fetch(`${gatewayUrl}/instance/delete/${instance}`, {
            method: 'DELETE',
            headers: { 'apikey': globalApiKey }
        });

        // Create
        const createRes = await fetch(`${gatewayUrl}/instance/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': globalApiKey
            },
            body: JSON.stringify({
                instanceName: instance,
                token: "qm0d4dfhj1ho95ajshj95p",
                number: number,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS"
            })
        });

        const createData = await createRes.json();
        console.log("Create Data:", JSON.stringify(createData, null, 2));

        // Wait 3s for Baileys socket init
        await new Promise(r => setTimeout(r, 3000));

        // Connect
        const connRes = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });

        const connData = await connRes.json();
        console.log("\nConnect Data:", JSON.stringify(connData, null, 2));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
