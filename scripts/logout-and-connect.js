const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`🔄 Logging out and reconnecting instance '${instance}'...\n`);

    try {
        // Logout
        const logoutRes = await fetch(`${gatewayUrl}/instance/logout/${instance}`, {
            method: 'DELETE',
            headers: { 'apikey': globalApiKey }
        });
        console.log("Logout Output:", logoutRes.status, await logoutRes.text());

        // Connect
        const connRes = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });
        console.log("\nConnect Output:", connRes.status, await connRes.text());
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
