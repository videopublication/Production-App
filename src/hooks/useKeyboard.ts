import { useState, useEffect } from 'react';

export function useKeyboard() {
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    useEffect(() => {
        // Initial check
        if (typeof window === 'undefined') return;

        const handleFocus = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                setIsKeyboardOpen(true);
            }
        };

        const handleBlur = (e: FocusEvent) => {
            // Check if focus moved to another input, if not, keyboard closed
            // Slight delay to allow focus to move
            setTimeout(() => {
                const active = document.activeElement as HTMLElement;
                if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && !active.isContentEditable)) {
                    setIsKeyboardOpen(false);
                }
            }, 50);
        };

        // Also listen for visual viewport resize which is the most reliable way on mobile
        const handleResize = () => {
            if (!window.visualViewport) return;
            // If height shrinks by > 20%, assume keyboard
            const heightRatio = window.visualViewport.height / window.screen.height;
            // But screen.height includes status bars etc.
            // Better: Compare to window.innerHeight initial
        };

        // Combining approaches: Focus is usually 1:1 with keyboard on mobile web for required inputs.
        // We will stick to focus events + window resize logic for robustness if needed, 
        // but simple focus listeners are often enough for "hiding bottom bar".

        document.addEventListener('focusin', handleFocus);
        document.addEventListener('focusout', handleBlur);

        return () => {
            document.removeEventListener('focusin', handleFocus);
            document.removeEventListener('focusout', handleBlur);
        };
    }, []);

    return isKeyboardOpen;
}
