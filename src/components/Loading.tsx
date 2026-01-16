"use client";

interface LoadingProps {
    /** Size of the spinner in pixels (default: 48) */
    size?: number;
    /** Optional loading text to display */
    text?: string;
    /** Whether to show as fullscreen overlay (default: false) */
    fullScreen?: boolean;
    /** Custom class name for additional styling */
    className?: string;
}

export default function Loading({
    size = 48,
    text,
    fullScreen = false,
    className = "",
}: LoadingProps) {
    const content = (
        <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
            {/* CSS-only animated spinner */}
            <div
                className="loading-spinner"
                style={{
                    width: size,
                    height: size,
                }}
            />
            {text && (
                <p className="text-muted-foreground text-sm font-medium animate-pulse">
                    {text}
                </p>
            )}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                {content}
            </div>
        );
    }

    return content;
}

// Convenience components for common use cases
export function PageLoading({ text = "Loading..." }: { text?: string }) {
    return (
        <div className="flex h-[50vh] items-center justify-center">
            <Loading size={64} text={text} />
        </div>
    );
}

export function FullScreenLoading({ text = "Loading..." }: { text?: string }) {
    return <Loading size={64} text={text} fullScreen />;
}

export function InlineLoading({ size = 32 }: { size?: number }) {
    return <Loading size={size} />;
}
