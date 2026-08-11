# WhatsApp Gateway Online Deployment Guide 🚀

This guide explains how to deploy the WhatsApp microservice online so it runs **24/7 in the cloud** without requiring your local machine to stay on.

---

## 💡 Deployment Options Comparison

| Provider | Cost | Setup Effort | Persistent Auth Session | Recommended For |
| :--- | :--- | :--- | :--- | :--- |
| **VPS (DigitalOcean / AWS / Linode)** | ~$4–$6/mo | Low (1 command) | 100% Reliable | **Best for Production** |
| **Railway / Render (Paid)** | ~$5/mo | Very Low | Persistent Volume | Good Cloud Managed |
| **Always-On Office PC / Raspberry Pi** | $0 | Low | Local Disk | Free Self-Hosted |

---

## Option 1: VPS Deployment (DigitalOcean / AWS / Linode) ⭐ RECOMMENDED

### Step 1: Connect to your Cloud Server
```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: Install Node.js & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2
```

### Step 3: Clone Gateway & Install Dependencies
```bash
git clone <YOUR_GIT_REPOSITORY_URL> /opt/whatsapp-gateway
cd /opt/whatsapp-gateway/scripts/whatsapp-gateway
npm install --production
```

### Step 4: Start Process with PM2 (24/7 Execution)
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Step 5: Connect QR Code & Update App Environment
1. Open `http://YOUR_SERVER_IP:3001/qr` in your browser.
2. Open WhatsApp on your phone $\rightarrow$ **Linked Devices** $\rightarrow$ **Link a Device** $\rightarrow$ Scan the QR code.
3. Update your production Vercel/Render `.env` or Department settings:
   ```env
   WHATSAPP_GATEWAY_URL="http://YOUR_SERVER_IP:3001"
   WHATSAPP_GROUP_JID="120363424310845566@g.us"
   ```

---

## Option 2: Docker Deployment (`docker compose`)

On any server with Docker installed:
```bash
cd scripts/whatsapp-gateway
docker compose up -d --build
```
The session credentials are automatically saved in `./auth_info` volume mount across container restarts.

---

## Option 3: Railway / Render Cloud Deployment

1. Create a New Web Service pointing to `scripts/whatsapp-gateway`.
2. Attach a **Persistent Disk Volume** mounted at `/app/auth_info`.
3. Set environment variable: `PORT=3001`.
4. Copy the assigned URL (e.g. `https://your-gateway.up.railway.app`).
5. Update your app settings in `/admin/whatsapp` or `.env.production`:
   `WHATSAPP_GATEWAY_URL="https://your-gateway.up.railway.app"`.
