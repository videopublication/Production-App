/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// REPLACE WITH YOUR FIREBASE CONFIG
// Service Workers don't have access to process.env in the same way, 
// so you might need to hardcode these OR use a build step to inject them.
// For now, we will leave placeholders.
const firebaseConfig = {
    // apiKey: "...",
    // ...
};

// Initialize Firebase
if (firebase.apps.length === 0) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (err) {
        console.error("Failed to init firebase in SW", err);
    }
}

if (firebase.messaging.isSupported()) {
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(function (payload) {
        console.log('[firebase-messaging-sw.js] Received background message ', payload);

        const notificationTitle = payload.notification.title;
        const notificationOptions = {
            body: payload.notification.body,
            icon: '/icons/icon-192x192.png', // Ensure this exists
            badge: '/icons/badge.png'         // Optional
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
}
