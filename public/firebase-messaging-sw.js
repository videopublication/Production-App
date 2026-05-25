// Handle notification click before importing Firebase Messaging.
self.addEventListener('notificationclick', function (event) {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event);
    event.notification.close();

    const link = event.notification.data?.link || '/notifications';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clientList) {
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if ('focus' in client) {
                        client.focus();
                        if (client.navigate) {
                            return client.navigate(link);
                        }
                        return client;
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(link);
                }
            })
    );
});

importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

// Firebase configuration - MUST match your .env.local values
const firebaseConfig = {
    apiKey: "AIzaSyAn5TWrewmgA8HRTK5s9W9ttEqmO3p2Ct0",
    authDomain: "vpub-app.firebaseapp.com",
    projectId: "vpub-app",
    storageBucket: "vpub-app.firebasestorage.app",
    messagingSenderId: "644051665100",
    appId: "1:644051665100:web:6bbc41058d9288d4ae0269"
};

// Initialize Firebase
if (firebase.apps.length === 0) {
    try {
        firebase.initializeApp(firebaseConfig);
        console.log('[firebase-messaging-sw.js] Firebase initialized successfully');
    } catch (err) {
        console.error("[firebase-messaging-sw.js] Failed to init firebase in SW", err);
    }
}

// Handle background messages
if (firebase.messaging.isSupported()) {
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(function (payload) {
        console.log('[firebase-messaging-sw.js] Received background message:', payload);

        if (payload.notification) {
            console.log('[firebase-messaging-sw.js] Notification payload present; letting the browser display it.');
            return;
        }

        const notificationTitle = payload.notification?.title || payload.data?.title || 'New Notification';
        const notificationBody = payload.notification?.body || payload.data?.message || payload.data?.body || '';
        const notificationLink = payload.data?.link || '/notifications';
        const notificationOptions = {
            body: notificationBody,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: payload.data?.tag || `vp-app-${notificationLink}`,
            timestamp: Number(payload.data?.timestamp) || Date.now(),
            data: {
                ...(payload.data || {}),
                link: notificationLink,
            },
            actions: [
                {
                    action: 'open',
                    title: 'Open',
                },
            ],
            requireInteraction: false,
            silent: false
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
}

console.log('[firebase-messaging-sw.js] Service worker loaded');
