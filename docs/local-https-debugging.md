# Local HTTPS Debugging

Use this for browser features that require a secure origin on real phones: camera access, service workers, PWA install behavior, geolocation, and push notifications.

This workflow is local-only. It does not use Cloudflare Tunnel, ngrok, or any external reverse tunnel.

## Required Cert Files

Place an IT-approved HTTPS certificate and key here:

```text
certs/local-dev.crt
certs/local-dev.key
```

The certificate must be trusted by the phone and must include the hostname or IP address you will open on the phone in its Subject Alternative Name list.

Examples:

```text
192.168.1.42
aman-laptop.company.local
production-app-dev.company.local
```

The `certs/` directory is ignored by git so private keys are not committed.

## Start Local HTTPS

```powershell
npm run dev:https
```

Then open the matching HTTPS URL on the phone, for example:

```text
https://192.168.1.42:3000
```

## Phone Trust Setup

Android:

- Install the root CA or certificate using your company-approved certificate flow.
- Use Chrome after the certificate is trusted.

iPhone:

- Install the certificate profile.
- Enable full trust in Settings under certificate trust settings.
- For iOS web push, install/open the app from the Home Screen on iOS 16.4 or later.

## Notes

- A self-signed certificate that the phone does not trust will not be enough for service workers or push testing.
- If the URL changes, the browser may create a new FCM token because push tokens are tied to the origin.
- Google OAuth and any third-party callbacks must allow the exact HTTPS origin if you test login flows locally.
