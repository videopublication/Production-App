'use client';

import { useCallback, useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { initFirebase } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';

type NotificationPermissionState = NotificationPermission | 'unsupported';

let hasSetupListener = false;
let tokenRequestPromise: Promise<string | null> | null = null;
let cachedToken: string | null = null;
const savedTokenByUserId = new Map<string, string>();
const saveTokenPromises = new Map<string, Promise<void>>();

const FCM_TOKEN_STORAGE_KEY = 'fcm-token';

function getNotificationPermission(): NotificationPermissionState {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
    }
    return Notification.permission;
}

function getCachedToken() {
    if (cachedToken || typeof window === 'undefined') return cachedToken;

    try {
        cachedToken = window.localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    } catch {
        cachedToken = null;
    }

    return cachedToken;
}

function cacheToken(token: string) {
    cachedToken = token;
    try {
        window.localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
    } catch {
        // localStorage can be unavailable in some private browsing modes.
    }
}

function usesExpectedWorker(registration?: ServiceWorkerRegistration | null) {
    return registration?.active?.scriptURL.endsWith('/sw.js') ?? false;
}

async function waitForInstallingWorker(registration: ServiceWorkerRegistration) {
    const worker = registration.installing || registration.waiting;
    if (!worker || worker.state === 'activated') return;

    await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 5000);
        const handleStateChange = () => {
            if (worker.state === 'activated' || worker.state === 'redundant') {
                window.clearTimeout(timeout);
                worker.removeEventListener('statechange', handleStateChange);
                resolve();
            }
        };

        worker.addEventListener('statechange', handleStateChange);
    });
}

async function getMessagingServiceWorkerRegistration() {
    let registration = await navigator.serviceWorker.getRegistration('/');

    if (!usesExpectedWorker(registration)) {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await waitForInstallingWorker(registration);
    }

    await navigator.serviceWorker.ready;
    return registration;
}

async function requestFcmToken({ requestPermission = false } = {}) {
    if (!('Notification' in window)) {
        console.log('[FCM] Notifications not supported');
        return null;
    }

    if (!requestPermission && Notification.permission !== 'granted') {
        console.log('[FCM] Notification permission not granted yet');
        return null;
    }

    if (tokenRequestPromise) return tokenRequestPromise;

    tokenRequestPromise = (async () => {
        try {
            if (!('serviceWorker' in navigator)) {
                console.log('[FCM] Service workers not supported');
                return null;
            }

            const { messaging } = await initFirebase();
            if (!messaging) {
                console.log('[FCM] Messaging not supported');
                return null;
            }

            let permission = Notification.permission;
            if (permission === 'default') {
                if (!requestPermission) return null;
                permission = await Notification.requestPermission();
            }

            console.log('[FCM] Notification permission:', permission);
            if (permission !== 'granted') return null;

            const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
            if (!vapidKey) {
                console.warn('[FCM] NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing');
                return null;
            }

            const swRegistration = await getMessagingServiceWorkerRegistration();
            const currentToken = await getToken(messaging, {
                vapidKey,
                serviceWorkerRegistration: swRegistration,
            });

            if (!currentToken) {
                console.log('[FCM] No registration token available');
                return null;
            }

            console.log('[FCM] Token received:', `${currentToken.substring(0, 20)}...`);
            cacheToken(currentToken);
            return currentToken;
        } catch (error) {
            console.error('[FCM] Error setting up token:', error);
            return null;
        } finally {
            tokenRequestPromise = null;
        }
    })();

    return tokenRequestPromise;
}

async function saveTokenForUser(userId: string, token: string) {
    if (savedTokenByUserId.get(userId) === token) return;

    const cacheKey = `${userId}:${token}`;
    const existingSave = saveTokenPromises.get(cacheKey);
    if (existingSave) return existingSave;

    const savePromise = (async () => {
        const response = await fetch('/api/notifications/register-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
            }),
        });

        if (!response.ok) {
            const details = await response.json().catch(() => null);
            throw new Error(details?.error || `Token registration failed with status ${response.status}`);
        }

        savedTokenByUserId.set(userId, token);
        console.log('[FCM] Token saved to database');
    })().finally(() => {
        saveTokenPromises.delete(cacheKey);
    });

    saveTokenPromises.set(cacheKey, savePromise);
    return savePromise;
}

export default function useFcmToken() {
    const { user } = useAuth();
    const userId = user?.id;
    const { showToast } = useToast();
    const [token, setToken] = useState<string | null>(() => getCachedToken());
    const [notificationPermission, setNotificationPermission] =
        useState<NotificationPermissionState>(getNotificationPermission());

    const setupToken = useCallback(async ({ requestPermission = false } = {}) => {
        setNotificationPermission(getNotificationPermission());

        const currentToken = await requestFcmToken({ requestPermission });

        setNotificationPermission(getNotificationPermission());
        setToken(currentToken);

        if (currentToken && userId) {
            try {
                await saveTokenForUser(userId, currentToken);
            } catch (error) {
                console.error('[FCM] Failed to save FCM token', error);
            }
        }

        return currentToken;
    }, [userId]);

    const enableNotifications = useCallback(() => {
        return setupToken({ requestPermission: true });
    }, [setupToken]);

    useEffect(() => {
        let isMounted = true;

        const setupExistingToken = async () => {
            setNotificationPermission(getNotificationPermission());

            const currentToken = await requestFcmToken();
            if (!isMounted) return;

            setNotificationPermission(getNotificationPermission());
            setToken(currentToken);

            if (currentToken && userId) {
                try {
                    await saveTokenForUser(userId, currentToken);
                } catch (error) {
                    console.error('[FCM] Failed to save FCM token', error);
                }
            }
        };

        setupExistingToken();

        return () => {
            isMounted = false;
        };
    }, [userId]);

    // Foreground Message Handler
    useEffect(() => {
        if (hasSetupListener) return;
        hasSetupListener = true;

        const setupListener = async () => {
            if (!('Notification' in window)) return;

            const { messaging } = await initFirebase();
            if (!messaging) return;

            onMessage(messaging, (payload) => {
                console.log('[FCM] Foreground Message:', payload);

                const title = payload.notification?.title || payload.data?.title || 'New Notification';
                const body = payload.notification?.body || payload.data?.message || payload.data?.body || '';
                const link = payload.data?.link || '/notifications';

                showToast(`${title}: ${body}`, 'success');

                if (Notification.permission !== 'granted') return;

                navigator.serviceWorker.ready
                    .then((registration) => registration.showNotification(title, {
                        body,
                        icon: '/icon-192.png',
                        badge: '/icon-192.png',
                        tag: `notification-${Date.now()}`,
                        data: { link },
                    }))
                    .catch((e) => {
                        console.error('[FCM] Failed to show foreground notification:', e);
                    });
            });
        };

        setupListener();
    }, [showToast]);

    return { token, notificationPermission, enableNotifications };
}
