const fs = require('fs');
const path = require('path');

const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";
const globalApiKey = "vp_app_secret_key_2026";
const instance = "vp-app";

async function main() {
    console.log(`🚀 Requesting live QR Code for instance '${instance}'...\n`);

    try {
        // First call triggers socket init
        await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });

        console.log("Waiting 4 seconds for QR socket initialization...");
        await new Promise(r => setTimeout(r, 4000));

        // Second call fetches QR payload
        const res = await fetch(`${gatewayUrl}/instance/connect/${instance}`, {
            headers: { 'apikey': globalApiKey }
        });

        const data = await res.json();
        console.log("Connect Response:", JSON.stringify(data, null, 2));

        const base64 = data.base64 || data.qrcode?.base64;
        const code = data.code || data.pairingCode || data.qrcode?.code;

        if (base64) {
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Gateway QR Code</title>
    <style>
        body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background: #0b141a; color: white; }
        img { width: 320px; height: 320px; border-radius: 12px; border: 8px solid white; margin-top: 20px; }
    </style>
</head>
<body>
    <h2>Scan with WhatsApp (Linked Devices)</h2>
    <img src="${base64}" alt="QR Code" />
</body>
</html>`;
            const htmlPath = path.join(__dirname, 'qr.html');
            fs.writeFileSync(htmlPath, htmlContent);
            console.log(`\n🎉 SUCCESS! Created file: file:///${htmlPath.replace(/\\/g, '/')}`);
        } else if (code) {
            console.log(`\n🎉 YOUR PAIRING CODE: ${code}`);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
