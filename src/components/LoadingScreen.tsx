import { Loader2 } from "lucide-react";

export default function LoadingScreen({ message = "Loading..." }: { message?: string }) {
    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
            <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground animate-pulse">
                    {message}
                </p>
            </div>
        </div>
    );
}
