"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from 'idb-keyval';
import { useState, useEffect } from "react";
import LoadingScreen from "@/components/LoadingScreen";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 5 * 60 * 1000, // 5 minutes
                        gcTime: 24 * 60 * 60 * 1000, // 24 hours
                        retry: 3, // Increase retry count for unstable networks
                        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
                        refetchOnWindowFocus: true,
                        refetchOnReconnect: true, // simplified from 'always'
                        networkMode: 'offlineFirst', // Handle offline/slow network gracefully
                    },
                    mutations: {
                        retry: 3,
                        networkMode: 'offlineFirst',
                    }
                },
            })
    );

    const [persister, setPersister] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

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
                key: 'OFFLINE_CACHE',
                throttleTime: 1000,
            });
            setPersister(idbPersister);
            setIsLoading(false);
        }
    }, []);

    if (isLoading || !persister) {
        return <LoadingScreen message="Initializing App..." />;
    }

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister,
                maxAge: 24 * 60 * 60 * 1000, // Sync matches gcTime
            }}
            onSuccess={() => console.log("Cache restored from persistence (IndexedDB)")}
        >
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
        </PersistQueryClientProvider>
    );
}

