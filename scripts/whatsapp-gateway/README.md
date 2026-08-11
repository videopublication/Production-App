# WhatsApp Gateway Microservice

A 100% free microservice built with Node.js and `@whiskeysockets/baileys` to dispatch messages to **WhatsApp Groups**.

## How to Run Locally

1. Navigate to this directory:
   ```bash
   cd scripts/whatsapp-gateway
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the gateway server:
   ```bash
   npm start
   ```

4. Scan the QR code displayed in the terminal using your WhatsApp mobile app (Linked Devices).

## Environment Variables (.env.local in main app)

Add the following to your main VP App `.env.local`:

```env
WHATSAPP_GATEWAY_URL="http://localhost:3001"
WHATSAPP_GROUP_JID="120363xxxxxxxxx@g.us"
WHATSAPP_BOT_SECRET="your_secret_key"
CRON_SECRET="your_cron_secret_key"
```

### How to Find Your WhatsApp Group JID
When your WhatsApp account joins the target group, the gateway console will log messages from the group, or you can send a test message to inspect the `groupJid` (format: `[digits]@g.us`).
