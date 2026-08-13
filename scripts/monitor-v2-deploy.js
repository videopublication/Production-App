const gatewayUrl = "https://vp-app-whatsapp-gateway.onrender.com";

async function main() {
    console.log(`⏳ Monitoring deployment of Evolution API v2 on ${gatewayUrl}...\n`);

    for (let i = 1; i <= 15; i++) {
        try {
            const res = await fetch(`${gatewayUrl}/`);
            if (res.ok) {
                const data = await res.json();
                console.log(`[Attempt ${i}] Status ${res.status} | Version: ${data.version || JSON.stringify(data)}`);
                if (data.version && data.version.startsWith('2.')) {
                    console.log('\n🎉 SUCCESS! Evolution API v2 is LIVE and connected!');
                    return;
                }
            } else {
                console.log(`[Attempt ${i}] Status ${res.status} (Deploying...)`);
            }
        } catch (e) {
            console.log(`[Attempt ${i}] Connecting... (${e.message})`);
        }
        await new Promise(r => setTimeout(r, 6000));
    }
}

main();
