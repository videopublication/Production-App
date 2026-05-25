import React, { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: string;
}

interface SelectProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
    onOpenChange?: (isOpen: boolean) => void;
}

export const Select: React.FC<SelectProps> = ({
    label,
    value,
    onChange,
    options,
    placeholder = 'Select an option',
    className = '',
    onOpenChange
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMobilePicker, setIsMobilePicker] = useState(false);
    const [mobileDropdownStyle, setMobileDropdownStyle] = useState<React.CSSProperties>({});
    const [mobileOptionsMaxHeight, setMobileOptionsMaxHeight] = useState(240);

    // Notify parent of state change
    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)');
        const syncMobilePicker = () => setIsMobilePicker(mediaQuery.matches);

        syncMobilePicker();
        mediaQuery.addEventListener('change', syncMobilePicker);
        return () => mediaQuery.removeEventListener('change', syncMobilePicker);
    }, []);

    useEffect(() => {
        if (isOpen && !isMobilePicker && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen, isMobilePicker]);

    useEffect(() => {
        if (!isOpen || !isMobilePicker) return;

        const updatePosition = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;

            const rect = trigger.getBoundingClientRect();
            const visualViewport = window.visualViewport;
            const viewportWidth = visualViewport?.width ?? window.innerWidth;
            const viewportHeight = visualViewport?.height ?? window.innerHeight;
            const offsetLeft = visualViewport?.offsetLeft ?? 0;
            const offsetTop = visualViewport?.offsetTop ?? 0;
            const margin = 12;
            const gap = 8;
            const searchHeight = 64;
            const minOptionsHeight = 140;
            const minPanelHeight = searchHeight + minOptionsHeight;
            const maxPanelHeight = 360;
            const availableBelow = viewportHeight - rect.bottom - gap - margin;
            const availableAbove = rect.top - gap - margin;
            const shouldOpenBelow = availableBelow >= minPanelHeight || availableBelow >= availableAbove;
            const availableSpace = shouldOpenBelow ? availableBelow : availableAbove;
            const panelHeight = Math.max(minPanelHeight, Math.min(maxPanelHeight, availableSpace));
            const width = Math.min(rect.width, viewportWidth - margin * 2);
            const left = Math.max(
                margin + offsetLeft,
                Math.min(rect.left + offsetLeft, viewportWidth + offsetLeft - width - margin)
            );
            const top = shouldOpenBelow
                ? rect.bottom + gap + offsetTop
                : Math.max(margin + offsetTop, rect.top - gap - panelHeight + offsetTop);

            setMobileDropdownStyle({
                top,
                left,
                width,
                maxHeight: panelHeight,
                boxShadow: '0 18px 50px rgba(0, 0, 0, 0.28)'
            });
            setMobileOptionsMaxHeight(Math.max(minOptionsHeight, panelHeight - searchHeight));
        };

        const frame = window.requestAnimationFrame(updatePosition);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        window.visualViewport?.addEventListener('resize', updatePosition);
        window.visualViewport?.addEventListener('scroll', updatePosition);

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            window.visualViewport?.removeEventListener('resize', updatePosition);
            window.visualViewport?.removeEventListener('scroll', updatePosition);
        };
    }, [isOpen, isMobilePicker]);

    // Handle back button to close dropdown
    useEffect(() => {
        if (isOpen) {
            // Push state when opening
            window.history.pushState({ selectOpen: true }, '', window.location.href);

            const handlePopState = () => {
                // When back button is pressed, close dropdown
                setIsOpen(false);
                setSearch('');
            };

            window.addEventListener('popstate', handlePopState);
            return () => {
                window.removeEventListener('popstate', handlePopState);
            };
        }
    }, [isOpen]);

    const dropdownStyle: React.CSSProperties = isMobilePicker
        ? mobileDropdownStyle
        : { boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)' };

    return (
        <div className={`${className}`} ref={containerRef}>
            {label && (
                <label className="block text-[13px] font-medium text-muted-foreground mb-2">
                    {label}
                </label>
            )}
            <div className="relative">
                {/* Search Input Trigger */}
                <div
                    ref={triggerRef}
                    onClick={() => {
                        setIsOpen(true);
                        if (!isMobilePicker) {
                            searchInputRef.current?.focus();
                        }
                    }}
                    className={`flex h-12 w-full items-center gap-2 rounded-xl bg-[#f5f5f7] dark:bg-[#2c2c2e] px-3 text-[15px] transition-all duration-200 border border-transparent ${isOpen
                        ? 'ring-2 ring-primary bg-white dark:bg-[#1c1c1e]'
                        : 'hover:bg-[#e8e8ed] dark:hover:bg-[#3a3a3c]'
                        }`}
                >
                    <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>

                    <input
                        ref={searchInputRef}
                        type="text"
                        readOnly={isMobilePicker}
                        inputMode={isMobilePicker ? 'none' : 'text'}
                        className={`flex-1 w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none ${isMobilePicker ? 'cursor-pointer' : ''}`}
                        placeholder={selectedOption ? selectedOption.label : placeholder}
                        value={isMobilePicker ? '' : search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => {
                            if (!isMobilePicker) setIsOpen(true);
                        }}
                    />

                    <div className="flex items-center gap-1">
                        {selectedOption && selectedOption.value && !search && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                                Selected
                            </span>
                        )}
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isOpen) {
                                    window.history.back(); // Using history back ensures state is cleaned up
                                } else {
                                    setIsOpen(true);
                                }
                            }}
                            className="cursor-pointer p-1"
                        >
                            <svg
                                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Dropdown Panel */}
                {isOpen && (
                    <div
                        className={isMobilePicker
                            ? 'fixed z-[160] overflow-hidden rounded-[22px] border border-border bg-white dark:bg-[#1c1c1e]'
                            : 'absolute z-[100] mt-2 w-full overflow-hidden rounded-2xl bg-white dark:bg-[#1c1c1e] border border-border'
                        }
                        style={dropdownStyle}
                    >
                        {isMobilePicker && (
                            <div className="border-b border-border p-2">
                                <div className="flex h-11 items-center gap-2 rounded-2xl bg-[#f5f5f7] px-3 dark:bg-[#2c2c2e]">
                                    <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search options..."
                                        className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
                                    />
                                    {search && (
                                        <button
                                            type="button"
                                            onClick={() => setSearch('')}
                                            className="rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                                            aria-label="Clear search"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        {/* Options list */}
                        <div
                            className={`${isMobilePicker ? '' : 'max-h-56'} overflow-auto p-2`}
                            style={isMobilePicker ? { maxHeight: mobileOptionsMaxHeight } : undefined}
                        >
                            {filteredOptions.length === 0 ? (
                                <div className="py-6 text-center text-[14px] text-muted-foreground">
                                    {search ? 'No matches found.' : 'No options available.'}
                                </div>
                            ) : (
                                filteredOptions.map((option, index) => (
                                    <div
                                        key={option.value}
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                            setSearch(''); // Clear search on select
                                        }}
                                        className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[15px] transition-colors ${index < filteredOptions.length - 1 ? 'mb-1' : ''
                                            } ${value === option.value
                                                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                                                : 'text-foreground hover:bg-[#f5f5f7] dark:hover:bg-[#2c2c2e]'
                                            }`}
                                    >
                                        <span>{option.label}</span>
                                        {value === option.value && (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
