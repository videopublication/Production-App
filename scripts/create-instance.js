const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`🚀 Creating instance '${instance}' on Evolution API v2.2.3...\n`);

    try {
        const res = await fetch(`${gatewayUrl}/instance/create`, {
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

        const data = await res.json();
        console.log("Create Instance Response:", res.status, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
