import React from 'react';

interface SkeletonProps {
    className?: string;
    description?: string; // For accessibility
}

export const Skeleton = ({ className, description }: SkeletonProps) => {
    return (
        <div
            className={`animate-pulse bg-gray-200 rounded-lg ${className}`}
            role="status"
            aria-label={description || "Loading..."}
        >
            <span className="sr-only">{description || "Loading..."}</span>
        </div>
    );
};
