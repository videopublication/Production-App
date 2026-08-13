const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`Re-creating instance '${instance}' with qrcode: true...\n`);

    try {
        await fetch(`${gatewayUrl}/instance/delete/${instance}`, {
            method: 'DELETE',
            headers: { 'apikey': globalApiKey }
        });

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
                number: "919310216809"
            })
        });

        const data = await createRes.json();
        console.log("Create Result:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
