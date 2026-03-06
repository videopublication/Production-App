import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging, isSupported } from 'firebase/messaging';

// REPLACE DETAILS WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

let firebaseApp: FirebaseApp | undefined = undefined;
let messaging: Messaging | undefined = undefined;

export const initFirebase = async () => {
    if (typeof window !== 'undefined' && await isSupported()) {
        if (!firebaseConfig.projectId) {
            console.warn("Firebase projectId is missing. Skipping Firebase initialization.");
            return { firebaseApp, messaging };
        }
        
        if (!getApps().length) {
            try {
                firebaseApp = initializeApp(firebaseConfig);
                messaging = getMessaging(firebaseApp);
            } catch (e) {
                console.error("Firebase init error", e);
            }
        } else {
            firebaseApp = getApp();
            messaging = getMessaging(firebaseApp);
        }
    }
    return { firebaseApp, messaging };
};
