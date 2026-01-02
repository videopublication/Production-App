'use client';

import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { initFirebase } from '@/lib/firebase';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth'; // Assuming you have this
import { useToast } from '@/lib/toast-context'; // Assuming you have this

export default function useFcmToken() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [token, setToken] = useState<string | null>(null);
    const [notificationPermission, setNotificationPermission] = useState('default');

    useEffect(() => {
        const setupToken = async () => {
            try {
                const { messaging } = await initFirebase();
                if (!messaging) return;

                const permission = await Notification.requestPermission();
                setNotificationPermission(permission);

                if (permission === 'granted') {
                    const currentToken = await getToken(messaging, {
                        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY // User needs to set this
                    });

                    if (currentToken) {
                        setToken(currentToken);
                        // Save token to database if user is logged in
                        if (user?.id) {
                            // Only update if it's new or different (Optional: check previous)
                            // For now, always sync on load to ensure accuracy
                            try {
                                await storage.updateUser(user.id, { fcmToken: currentToken });
                            } catch (e) {
                                console.error("Failed to save FCM token", e);
                            }
                        }
                    } else {
                        console.log('No registration token available. Request permission to generate one.');
                    }
                }
            } catch (error) {
                console.error('An error occurred while retrieving token. ', error);
            }
        };

        setupToken();
    }, [user]);

    // Foreground Message Handler
    useEffect(() => {
        const setupListener = async () => {
            const { messaging } = await initFirebase();
            if (!messaging) return;

            const unsubscribe = onMessage(messaging, (payload) => {
                console.log('Foreground Message:', payload);
                if (payload.notification) {
                    showToast(`${payload.notification.title}: ${payload.notification.body}`, 'success');
                    // Should trigger a re-fetch of logs or notifications if you have a list
                }
            });
            return () => unsubscribe();
        };

        setupListener();
    }, [showToast]);

    return { token, notificationPermission };
}
