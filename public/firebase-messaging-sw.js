/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

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

        const notificationTitle = payload.notification?.title || 'New Notification';
        const notificationOptions = {
            body: payload.notification?.body || '',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            tag: 'notification-' + Date.now(),
            data: payload.data || {},
            requireInteraction: false,
            silent: false
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
}

// Handle notification click
self.addEventListener('notificationclick', function (event) {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event);
    event.notification.close();

    // Get the link from notification data
    const link = event.notification.data?.link || '/notifications';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clientList) {
                // If a window is already open, focus it and navigate
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
                // Otherwise open a new window
                if (clients.openWindow) {
                    return clients.openWindow(link);
                }
            })
    );
});

console.log('[firebase-messaging-sw.js] Service worker loaded');
