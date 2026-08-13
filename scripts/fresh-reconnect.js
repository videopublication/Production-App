const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function run() {
    console.log("Deleting closed instance record from DB...");
    try {
        await fetch(`${gatewayUrl}/instance/delete/${instance}`, {
            method: 'DELETE',
            headers: { 'apikey': globalApiKey }
        });
    } catch (e) {}

    console.log("Creating fresh clean instance...");
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
            number: "919310216809",
            integration: "WHATSAPP-BAILEYS"
        })
    });
    console.log("Create Output:", await createRes.text());

    console.log("\nFetching QR / Pairing Code...");
    const connectRes = await fetch(`${gatewayUrl}/instance/connect/${instance}?number=919310216809`, {
        headers: { 'apikey': globalApiKey }
    });
    console.log("Connect Output:", await connectRes.text());
}

run();
