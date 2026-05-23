self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const link = event.notification.data?.link || '/notifications';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
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

                return undefined;
            })
    );
});

importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: 'AIzaSyAn5TWrewmgA8HRTK5s9W9ttEqmO3p2Ct0',
    authDomain: 'vpub-app.firebaseapp.com',
    projectId: 'vpub-app',
    storageBucket: 'vpub-app.firebasestorage.app',
    messagingSenderId: '644051665100',
    appId: '1:644051665100:web:6bbc41058d9288d4ae0269',
};

try {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        console.log('[sw.js] Received background message:', payload);

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
            silent: false,
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
} catch (error) {
    console.error('[sw.js] Firebase messaging setup failed:', error);
}
