# Vercel Environment Variables for Push Notifications

Add these environment variables in your Vercel project settings:
**Settings → Environment Variables**

---

## 1. Supabase (Required for Database)

| Variable Name | Value |
|---------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://esevwmkixggyctwryaov.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDMxNjgsImV4cCI6MjA4MDM3OTE2OH0.GWG-McUtDJ_-MWg2Lf0d7BqFyOIG2Curs9Vs0yLOglA` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI` |

---

## 2. Firebase Client-Side (Required for FCM Token)

| Variable Name | Value |
|---------------|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyAn5TWrewmgA8HRTK5s9W9ttEqmO3p2Ct0` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `vpub-app.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `vpub-app` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `vpub-app.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `644051665100` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:644051665100:web:6bbc41058d9288d4ae0269` |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | `BKZzHqp1xsJaeCF7mju6JYn5OvGTHAok7WJwh1b1s7E4GjiCCE8tQuSiIkGo3RPtUeik-uhRYVqQwF68Wcnb8Uw` |

---

## 3. Firebase Admin (Required for Sending Push Notifications from Server)

| Variable Name | Value |
|---------------|-------|
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@vpub-app.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | *(See below)* |

### ⚠️ Important: FIREBASE_PRIVATE_KEY Format

The private key must be formatted correctly. In Vercel, paste it **exactly as shown below** (with actual newlines, not `\n`):

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDja09d3sNP9RG6
kkJ/WY9JE3ptHIkLrvAOqyfgWst5cNtf4jK04C2kUjZ8kgvcMNqf4ZveLHxEfvqy
eOo9PHz4aS9vpgT7I6AVkIsFVZpJiElt09NVyieVSieIfAMGSAo6QqfVjChPnB0Y
zTIseBz2saiZePUpeE96MxPKebrqdHreOEycB8AEkTon3aRlkAAXEQIY0gEWBC1K
+9jW2n/EE0nfSD8IWo2jJis768UmVdQLgpJJwoMyQyNK/17vVALLT/g36atxkHjB
4zekVVc5RKQLMLZ1ZDCTVzfFzNR5CJudRUJnaClaXZAyzj6NY1dlVM6uYFQex6VD
3kUFVcidAgMBAAECggEAEXhvV4AoWRaJRwp7L8fRnVTw+9FW84NmnyXbBsigJs3l
QxDVgYt9jh5KX8L4xMX/AYxwxNOo3zqG/US92o2bRxpjgcGgp9SqigWO3HkhRLgC
y2cGrj7npWJrNjhao3X6In7M4GI86t1iEdiaRmFwI4EYjo5aJ8D9kAm89zoR7SFN
BDDbdVY3rMC7KdXh8VDHxARITtGWME11EkTtfAbn99OoWHc7QspsG958CuWb/PBb
zLvu+NUO+Do57bzRiuZyHwJgIJibChNCA68kVv5S9CUY+G9kkFTBhYMxp8h6lwei
Bq+REiKfkGIpyvYyNxfGYJcU36h3seKPt0F7CahwOQKBgQD4eDwVlUTnB8HKekmm
TgFUzmxiIjI3ufNQ7v960zZ6YYD8ytGtibq+cymXRzpNKBRQgsEudJHWi0/n+SW8
ZrREwlDfjL22675Ku7pX9LhXkS6Ttup1B0LPgMUr6+UJ3XVlDY1XbKkY+8gZKMWa
8CTyGWE/0R2vWxSHNgs0T13hpQKBgQDqT8EFGs2pJ0yAe/gQlznd70vBU9JeFotp
XfkiSnyGXeqt7DeQcmYM/uV1jOMelR0ZOP8Z0WrWhzPNFjFIeoxPCAa6uCj6VwRZ
i3AU1Aq/uZNNME9549yhnXOgURHwPCnxDFwekl7Oc+lgfXbUwuj9L/p71s5yHlp4
kawvb/SpmQKBgQC4anUeB9ZGK0m4gJ8dYhQ236cuBveCyO9BCMJyZUWv+6KC/f42
cV07cbpS37jz/2VkhEfhtP9xX6EFKbTKaugtiJQB+DHvDHYGfeNG2QnhZI5PcJoA
Fk2OOaMegE1UzxwMzswzMSEou+e+VLal0st5LUEy3oDL4CwSVxhl0Op7SQKBgH3j
abYfZ33JYn3pnSb0yR9ncREmwvDQNgjfd3ooAO2EShE1x8iw3gl/bbMRhfkpbl/d
0pmBfWBTdc5rbQEe7oGLs2nghguycuDVXNuj7T6DKxQer6SyexjN6pCo3fVvra0X
0eqPA6byeeHgpta6/ckCXRbqGzMPAdajlZpLEW2JAoGAMR+//oiV+nybqKuxtrRC
e16d2aR7EPSgdq1L+Vnv205lpsStSYCJUij93DyMLPudtjlloanBx2SoSLO8FrB5
uuxVqwOHyXsdDIC01cjm2aPM8dm8Mqy9p7y8OpjyR2MRq7BQr9V+/JH8JcH3tGv2
Moy3oOg+0ewyPh/o8OX0e24=
-----END PRIVATE KEY-----
```

**Tip**: In Vercel, when pasting multi-line values, it handles them correctly. Just paste the key with actual line breaks.

---

## Total: 11 Environment Variables

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY`
4. `NEXT_PUBLIC_FIREBASE_API_KEY`
5. `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
6. `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
7. `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
8. `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
9. `NEXT_PUBLIC_FIREBASE_APP_ID`
10. `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
11. `FIREBASE_CLIENT_EMAIL`
12. `FIREBASE_PRIVATE_KEY`

---

## PWA Installation Troubleshooting

If PWA install is not working:

1. **Clear browser cache** - Hard refresh (Ctrl+Shift+R)
2. **Unregister old service workers** - Chrome DevTools → Application → Service Workers → Unregister
3. **Check manifest** - Chrome DevTools → Application → Manifest (should show green checkmarks)
4. **HTTPS required** - PWA install only works on HTTPS (Vercel provides this automatically)
5. **Wait for eligibility** - Chrome may take a few seconds after page load to show the install prompt

### Chrome Install Criteria:
- ✅ Served over HTTPS
- ✅ Has a valid manifest.json
- ✅ Has a service worker
- ✅ Has icons (192x192 and 512x512)
- ✅ User has interacted with the page
