const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`Setting groups_ignore: false for '${instance}'...\n`);

    try {
        const res = await fetch(`${gatewayUrl}/settings/set/${instance}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': globalApiKey
            },
            body: JSON.stringify({
                reject_call: false,
                msg_call: "",
                groups_ignore: false,
                always_online: false,
                read_messages: false,
                read_status: false,
                sync_full_history: false
            })
        });

        const data = await res.json();
        console.log("Settings Result:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
