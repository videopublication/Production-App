import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { User } from '@/types';

export const USER_KEYS = {
    all: ['users'] as const,
    detail: (id: string) => [...USER_KEYS.all, id] as const,
};

export function useUsers() {
    return useQuery({
        queryKey: USER_KEYS.all,
        queryFn: () => storage.getUsers(),
        staleTime: 60 * 1000, // 1 minute
    });
}
