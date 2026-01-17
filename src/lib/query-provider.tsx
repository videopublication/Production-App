"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
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
            const localStoragePersister = createSyncStoragePersister({
                storage: window.localStorage,
                key: 'OFFLINE_CACHE', // specialized key for app data
                throttleTime: 1000,
            });
            setPersister(localStoragePersister);
        }
    }, []);

    if (!persister) {
        // Provide basic query client without persistence during SSR/hydration
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
            onSuccess={() => console.log("Cache restored from persistence")}
        >
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
        </PersistQueryClientProvider>
    );
}
