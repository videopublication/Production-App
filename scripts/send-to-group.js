const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const apiKey = "qm0d4dfhj1ho95ajshj95p";
const instance = "vp-app";
const groupJid = "120363424310845566@g.us";

const message = "Namaskaram 🙏\n\n🎬 *VP PRODUCTION APP AUTOMATION TEST* 🎬\n\nThis is an automated test message sent directly to the group VP APP testing!\n\nPranam 🙏";

async function run() {
    console.log(`Sending to Group JID: ${groupJid}...`);
    try {
        const res = await fetch(`${gatewayUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey
            },
            body: JSON.stringify({
                number: groupJid,
                textMessage: {
                    text: message
                }
            })
        });
        console.log("Status:", res.status);
        console.log("Response:", await res.text());
    } catch (e) {
        console.error("Error:", e.message);
    }
}
run();
