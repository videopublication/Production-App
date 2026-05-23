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

        const notificationTitle = payload.notification?.title || 'New Notification';
        const notificationOptions = {
            body: payload.notification?.body || '',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `notification-${Date.now()}`,
            data: payload.data || {},
            requireInteraction: false,
            silent: false,
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
} catch (error) {
    console.error('[sw.js] Firebase messaging setup failed:', error);
}
