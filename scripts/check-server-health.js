const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";

async function check() {
    console.log(`Checking gateway health on ${gatewayUrl}...\n`);
    try {
        const r1 = await fetch(`${gatewayUrl}/`);
        console.log("GET / Status:", r1.status, await r1.text());

        const r2 = await fetch(`${gatewayUrl}/instance/fetchInstances`, {
            headers: { 'apikey': 'vp_app_secret_key_2026' }
        });
        console.log("GET /instance/fetchInstances Status:", r2.status, await r2.text());
    } catch (e) {
        console.error("Error:", e.message);
    }
}

check();
