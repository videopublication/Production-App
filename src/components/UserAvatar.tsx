import React from 'react';
import { initials, roleAvatarClass } from '@/lib/user-display';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, string> = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-11 h-11 text-base',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
};

interface UserAvatarProps {
    name?: string | null;
    /** Drives the tile colour: role, not identity, so admins read as admins. */
    role?: string | null;
    avatarUrl?: string | null;
    size?: AvatarSize;
    className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
    name,
    role,
    avatarUrl,
    size = 'md',
    className = '',
}) => {
    const base = `${SIZES[size]} rounded-full shrink-0 shadow-md`;

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={name || 'Member'}
                className={`${base} object-cover ${className}`}
            />
        );
    }

    return (
        <div
            aria-hidden="true"
            className={`${base} flex items-center justify-center font-semibold text-white ${roleAvatarClass(role)} ${className}`}
        >
            {initials(name).charAt(0)}
        </div>
    );
};
