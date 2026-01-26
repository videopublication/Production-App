'use client';

import React, { useState, useEffect, useRef } from 'react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, className = '', disabled = false }) => {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const pullThreshold = 80;

    const handleTouchStart = (e: React.TouchEvent) => {
        if (isRefreshing || disabled) return;

        // Only trigger if we are at the top of the container
        const container = containerRef.current;
        if (container && container.scrollTop === 0) {
            startY.current = e.touches[0].pageY;
            setIsPulling(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPulling || isRefreshing) return;

        const currentY = e.touches[0].pageY;
        const diff = currentY - startY.current;

        if (diff > 0) {
            // Apply resistance
            const distance = Math.min(diff * 0.4, pullThreshold + 20);
            setPullDistance(distance);

            // Prevent default scrolling if we are pulling down
            if (diff > 10 && e.cancelable) {
                // e.preventDefault(); // Might cause issues with nested scrolls, use touch-action: pan-y carefully
            }
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling || isRefreshing) return;

        if (pullDistance >= pullThreshold) {
            setIsRefreshing(true);
            setPullDistance(pullThreshold);
            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
        setIsPulling(false);
    };

    return (
        <div
            ref={containerRef}
            className={`relative overflow-y-auto w-full ${className}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                touchAction: pullDistance > 0 ? 'none' : 'auto'
            }}
        >
            {/* Pull Indicator */}
            <div
                className="absolute left-0 right-0 flex items-center justify-center transition-opacity"
                style={{
                    top: -40,
                    height: 40,
                    transform: `translateY(${pullDistance}px)`,
                    opacity: pullDistance > 20 ? 1 : 0,
                }}
            >
                <div className={`p-2 rounded-full bg-white dark:bg-gray-800 shadow-md border border-border flex items-center justify-center ${isRefreshing ? 'animate-spin' : ''}`}>
                    <svg
                        className="w-5 h-5 text-primary transition-transform"
                        style={{
                            transform: `rotate(${Math.min(pullDistance * 2, 180)}deg)`
                        }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        {isRefreshing ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        )}
                    </svg>
                </div>
            </div>

            {/* Content Wrapper */}
            <div
                style={{
                    transform: `translate3d(0, ${pullDistance}px, 0)`,
                    transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
                    willChange: 'transform'
                }}
            >
                {children}
            </div>
        </div>
    );
};
