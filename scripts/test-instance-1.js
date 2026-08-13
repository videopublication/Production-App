const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app-1";
const number = "919310216809";

async function run() {
    console.log(`🚀 Creating fresh instance '${instance}'...\n`);

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

    console.log("Create Output:", createRes.status, JSON.stringify(await createRes.json(), null, 2));

    console.log("\nConnecting...");
    const connRes = await fetch(`${gatewayUrl}/instance/connect/${instance}?number=${number}`, {
        headers: { 'apikey': globalApiKey }
    });

    console.log("Connect Output:", connRes.status, JSON.stringify(await connRes.json(), null, 2));
}

run();
