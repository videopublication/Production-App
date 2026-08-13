const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`Resetting instance '${instance}' on v1.8.2...\n`);

    try {
        // Delete
        const delRes = await fetch(`${gatewayUrl}/instance/delete/${instance}`, {
            method: 'DELETE',
            headers: { 'apikey': globalApiKey }
        });
        console.log("Delete Output:", delRes.status, await delRes.text());

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
                qrcode: true
            })
        });
        console.log("Create Output:", createRes.status, await createRes.text());

        // Connect
        const connRes = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });
        console.log("Connect Output:", connRes.status, await connRes.text());

    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
