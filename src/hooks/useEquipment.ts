import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Equipment } from '@/types';

export const EQUIPMENT_KEYS = {
    all: ['equipment'] as const,
    detail: (id: string) => [...EQUIPMENT_KEYS.all, id] as const,
};

export function useEquipment() {
    return useQuery({
        queryKey: EQUIPMENT_KEYS.all,
        queryFn: () => storage.getEquipment(),
        staleTime: 5 * 60 * 1000,
    });
}

export function useEquipmentItem(id: string) {
    return useQuery({
        queryKey: EQUIPMENT_KEYS.detail(id),
        queryFn: async () => {
            // For now we fetch all and find, as Supabase doesn't have getSingle easily wrapped in storage
            // This is actually better for cache consistency if list is already loaded
            const allItems = await storage.getEquipment();

            // Debugging lookup failure
            const decodedId = decodeURIComponent(id);
            const found = allItems.find(e =>
                e.id === id ||
                e.barcode === id ||
                e.barcode === decodedId
            );

            if (!found) {
                console.warn(`Equipment lookup failed. Searched for "${id}" (decoded: "${decodedId}") in ${allItems.length} items.`);
            }

            return found || null;
        },
        enabled: !!id,
    });
}

export function useAddEquipment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (item: Equipment) => storage.addEquipment(item),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all });
        },
    });
}

export function useUpdateEquipment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Equipment> }) =>
            storage.updateEquipment(id, updates),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all });
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.detail(id) });
        },
    });
}

export function useSaveEquipment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (items: Equipment[]) => storage.saveEquipment(items),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all });
        }
    })
}
