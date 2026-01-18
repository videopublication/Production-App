"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from 'idb-keyval';
import { useState, useEffect } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 5 * 60 * 1000, // Data matches cache for 5 minutes
                        gcTime: 24 * 60 * 60 * 1000, // Keep in garbage collector for 24 hours
                        retry: 1,
                        refetchOnWindowFocus: false,
                        refetchOnReconnect: 'always',
                    },
                },
            })
    );

    const [persister, setPersister] = useState<any>(null);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const idbPersister = createAsyncStoragePersister({
                storage: {
                    getItem: async (key) => {
                        try {
                            const value = await get(key);
                            return value ?? null;
                        } catch (error) {
                            console.error('Error restoring cache from IDB:', error);
                            return null;
                        }
                    },
                    setItem: async (key, value) => {
                        try {
                            await set(key, value);
                        } catch (error) {
                            console.error('Error saving cache to IDB:', error);
                        }
                    },
                    removeItem: async (key) => {
                        await del(key);
                    },
                },
                key: 'OFFLINE_CACHE', // specialized key for app data
                throttleTime: 1000,
            });
            setPersister(idbPersister);
        }
    }, []);

    if (!persister) {
        // Provide basic query client without persistence during SSR/hydration
        // Also serves as a fallback while the async persister is unavailable
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    }

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister }}
            onSuccess={() => console.log("Cache restored from persistence (IndexedDB)")}
        >
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
        </PersistQueryClientProvider>
    );
}
