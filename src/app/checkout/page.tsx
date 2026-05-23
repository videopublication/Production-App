'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Equipment, Transaction, User, Shoot } from '@/types';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { MultiSelect } from '@/components/MultiSelect';
import { QRScanner, MobileScanner } from '@/components/QRScanner';
import { Select } from '@/components/Select';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useConfirm } from '@/lib/dialog-context';
import { generateTransactionId, generateUUID } from '@/lib/id';
import { useInventory } from '@/hooks/useInventory';
import { useShoots } from '@/hooks/useShoots';
import { useCheckOut } from '@/hooks/useTransactions';
import { useAssignments } from '@/hooks/useAssignments';
import { useDepartment } from '@/lib/department-context';

export default function CheckoutPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { department } = useDepartment();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [cart, setCart] = useState<Equipment[]>([]);
    const cartRef = React.useRef<Equipment[]>([]);
    const [scanInput, setScanInput] = useState('');
    const [project, setProject] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedShootId, setSelectedShootId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Handle back button closing scanner
    useEffect(() => {
        if (showScanner) {
            // Push a state to history so back button catches it
            window.history.pushState({ scannerOpen: true }, '', window.location.href);

            const handlePopState = () => {
                setShowScanner(false);
            };

            window.addEventListener('popstate', handlePopState);

            return () => {
                window.removeEventListener('popstate', handlePopState);
            };
        }
    }, [showScanner]);

    // Handle back button for search focus
    useEffect(() => {
        if (isSearchFocused) {
            window.history.pushState({ searchFocused: true }, '', window.location.href);

            const handlePopState = () => {
                setIsSearchFocused(false);
                setScanInput('');
                setSuggestions([]);
                setShowSuggestions(false);
                // Blur the input if it's still focused
                (document.activeElement as HTMLElement)?.blur();
            };

            window.addEventListener('popstate', handlePopState);

            return () => {
                window.removeEventListener('popstate', handlePopState);
            };
        }
    }, [isSearchFocused]);

    const toggleScanner = () => {
        if (showScanner) {
            window.history.back(); // This triggers popstate -> closes scanner
        } else {
            // Slight delay to ensure animation starts smoothly
            requestAnimationFrame(() => setShowScanner(true));
        }
    };
    const [suggestions, setSuggestions] = useState<Equipment[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Data Hooks
    const { equipment: equipmentList, users: allUsers, isLoading: isInventoryLoading, refresh: refreshInventory } = useInventory();
    const { data: shoots = [], isLoading: isShootsLoading, refetch: refetchShoots } = useShoots();
    const { data: assignments = [], refetch: refetchAssignments } = useAssignments();

    const handleRefresh = async () => {
        await Promise.all([
            refreshInventory(),
            refetchShoots(),
            refetchAssignments()
        ]);
    };

    // Filter users based on role AND department for assignment dropdown
    const users = useMemo(() => {
        if (!user) return [];
        if (!['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) return [];

        // Super Admins: show all users (or filtered by selected department context)
        if (user.role === 'SUPER_ADMIN') {
            return department?.id ? allUsers.filter(u => u.departmentId === department.id) : allUsers;
        }

        // Regular Admins/Managers: only show users from their own department
        if (user.departmentId) {
            return allUsers.filter(u => u.departmentId === user.departmentId);
        }

        return allUsers;
    }, [user, allUsers, department?.id]);

    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    // Combine loading states
    const isDataLoading = isInventoryLoading || isShootsLoading;

    // Redirect if not authorized
    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            router.replace('/login');
            return;
        }

        const normalizedRole = user.role?.toUpperCase().replace(' ', '_') || 'CREW';
        if (!['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(normalizedRole)) {
            router.replace('/login');
        }
    }, [user, router, authLoading]);

    // Keep all active shoots in the dropdown (don't strictly hide if they just ended)
    const availableShoots = useMemo(() => {
        return shoots.filter(shoot => {
            // Exclude cancelled shoots
            if (shoot.status === 'CANCELLED') return false;
            return true;
        }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    }, [shoots]);

    // Ensure selected shoot is always in options even if hidden from main list
    const activeShootOptions = useMemo(() => {
        const baseOptions = availableShoots.map(shoot => ({
            value: shoot.id,
            label: `${shoot.title} — ${new Date(shoot.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        }));

        if (selectedShootId) {
            const selectedInAvailable = availableShoots.find(s => s.id === selectedShootId);
            if (!selectedInAvailable) {
                const shoot = shoots.find(s => s.id === selectedShootId);
                if (shoot) {
                    baseOptions.unshift({
                        value: shoot.id,
                        label: `${shoot.title} — ${new Date(shoot.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    });
                }
            }
        }
        return [{ value: '', label: 'Select a shoot...' }, ...baseOptions];
    }, [availableShoots, selectedShootId, shoots]);

    // Initialize/Load State (Session Persistence)
    useEffect(() => {
        const savedCart = sessionStorage.getItem('checkout-cart');
        if (savedCart) {
            try {
                const parsed = JSON.parse(savedCart);
                setCart(parsed);
                cartRef.current = parsed;
            } catch { sessionStorage.removeItem('checkout-cart'); }
        }

        const savedProject = sessionStorage.getItem('checkout-project');
        if (savedProject) setProject(savedProject);

        const savedNotes = sessionStorage.getItem('checkout-notes');
        if (savedNotes) setNotes(savedNotes);

        const savedShootId = sessionStorage.getItem('checkout-shoot');
        if (savedShootId) setSelectedShootId(savedShootId);

        const savedUsers = sessionStorage.getItem('checkout-users');
        if (savedUsers) {
            try {
                const parsed = JSON.parse(savedUsers);
                // If user is Admin/Manager and the saved selection is just themselves, clear it (don't default select)
                if (user && ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user.role) && parsed.length === 1 && parsed[0] === user.id) {
                    setSelectedUserIds([]);
                    sessionStorage.removeItem('checkout-users');
                } else {
                    setSelectedUserIds(parsed);
                }
            } catch { }
        } else if (user && !['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user.role)) {
            // Only auto-select for Crew who can't change it
            setSelectedUserIds([user.id]);
        }
    }, [user]);

    useEffect(() => {
        if (user && selectedUserIds.length === 0 && !sessionStorage.getItem('checkout-users')) {
            // Only auto-select for Crew who can't change it
            if (!['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user.role)) {
                setSelectedUserIds([user.id]);
            }
        }
    }, [user]);

    // Save state to session storage
    useEffect(() => {
        if (cart.length > 0) sessionStorage.setItem('checkout-cart', JSON.stringify(cart));
        else sessionStorage.removeItem('checkout-cart');
    }, [cart]);

    useEffect(() => {
        sessionStorage.setItem('checkout-project', project);
    }, [project]);

    useEffect(() => {
        sessionStorage.setItem('checkout-notes', notes);
    }, [notes]);

    useEffect(() => {
        if (selectedUserIds.length > 0) sessionStorage.setItem('checkout-users', JSON.stringify(selectedUserIds));
    }, [selectedUserIds]);

    useEffect(() => {
        if (selectedShootId) sessionStorage.setItem('checkout-shoot', selectedShootId);
        else sessionStorage.removeItem('checkout-shoot');
    }, [selectedShootId]);

    // Auto-select users based on shoot assignments
    useEffect(() => {
        if (selectedShootId && assignments.length > 0) {
            const linkedAssignments = assignments.filter(a => a.shootId === selectedShootId);
            if (linkedAssignments.length > 0) {
                const userIds = linkedAssignments.map(a => a.userId);
                const uniqueIds = Array.from(new Set(userIds));

                // Only update if different to avoid redundant toasts and renders
                const isSame = selectedUserIds.length === uniqueIds.length &&
                    selectedUserIds.every(id => uniqueIds.includes(id));

                if (!isSame) {
                    setSelectedUserIds(uniqueIds);
                    showToast(`Auto-selected ${uniqueIds.length} crew members`, 'info');
                }
            }
        }
    }, [selectedShootId, assignments, selectedUserIds, showToast]);

    const lastProcessedRef = React.useRef<{ code: string; time: number } | null>(null);

    const playSuccessSound = () => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
            if (navigator.vibrate) navigator.vibrate(200);
        } catch (e) { }
    };

    const playErrorSound = () => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } catch (e) { }
    };

    const processBarcode = (barcode: string, keepSearchOpen = false) => {
        const normalizedBarcode = barcode.trim();
        const now = Date.now();
        if (lastProcessedRef.current &&
            lastProcessedRef.current.code.toLowerCase() === normalizedBarcode.toLowerCase() &&
            now - lastProcessedRef.current.time < 2000) {
            return;
        }

        // IMMEDIATE UPDATE: Prevent race conditions from rapid scanner callbacks
        lastProcessedRef.current = { code: normalizedBarcode, time: now };

        if (!normalizedBarcode) return;

        const item = equipmentList.find(i =>
            i.barcode.toLowerCase() === normalizedBarcode.toLowerCase() ||
            i.id === normalizedBarcode
        );

        if (!item) {
            showToast('Item not found', 'error');
            playErrorSound();
            return;
        }

        if (item.status !== 'AVAILABLE') {
            const statusMessage = item.status === 'CHECKED_OUT'
                ? 'checked out'
                : item.status === 'MAINTENANCE'
                    ? 'under maintenance'
                    : item.status.toLowerCase().replace('_', ' ');
            showToast(`Item "${item.name}" is currently ${statusMessage}`, 'error');
            playErrorSound();
            return;
        }

        if (cartRef.current.find(i => i.id === item.id)) {
            const serialInfo = item.serialNumber ? ` (S/N: ${item.serialNumber})` : '';
            showToast(`Item "${item.name}"${serialInfo} is already in cart`, 'info');
            playErrorSound();
            return;
        }

        const newCart = [...cartRef.current, item];
        cartRef.current = newCart;
        setCart(newCart);

        showToast(`Added "${item.name}"`, 'success');
        playSuccessSound();

        if (!keepSearchOpen) {
            setScanInput('');
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const updateSuggestions = (query: string, currentCart: Equipment[]) => {
        if (query.trim().length > 0) {
            const filtered = equipmentList.filter(item =>
                item.status === 'AVAILABLE' &&
                !currentCart.find(c => c.id === item.id) &&
                (
                    item.name.toLowerCase().includes(query.toLowerCase()) ||
                    item.barcode.toLowerCase().includes(query.toLowerCase()) ||
                    item.category.toLowerCase().includes(query.toLowerCase())
                )
            ).slice(0, 50);
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleInputChange = (value: string) => {
        setScanInput(value);
        updateSuggestions(value, cart);
    };

    // Update suggestions when cart changes if search is active
    useEffect(() => {
        if (scanInput.trim()) {
            updateSuggestions(scanInput, cart);
        }
    }, [cart, equipmentList]);

    const handleQRScan = (decodedText: string) => {
        try {
            const data = JSON.parse(decodedText);
            processBarcode(data.barcode || data.id || decodedText);
        } catch {
            processBarcode(decodedText);
        }
    };

    const removeFromCart = (id: string) => {
        const newCart = cartRef.current.filter(i => i.id !== id);
        cartRef.current = newCart;
        setCart(newCart);
    };

    const handleConfirmClear = async () => {
        const isConfirmed = await confirm({
            title: 'Clear Cart?',
            message: 'Are you sure you want to remove all items?',
            confirmLabel: 'Clear All',
            variant: 'danger'
        });

        if (isConfirmed) {
            cartRef.current = [];
            setCart([]);
            sessionStorage.removeItem('checkout-cart');
            showToast('Cart cleared', 'info');
        }
    };

    const { mutateAsync: checkout, isPending: isCheckoutLoading } = useCheckOut();

    const isSubmittingRef = React.useRef(false);
    const transactionIdRef = React.useRef<string | null>(null);

    const handleSuccess = () => {
        cartRef.current = [];
        setCart([]);
        setSelectedShootId('');
        sessionStorage.removeItem('checkout-cart');
        sessionStorage.removeItem('checkout-project');
        sessionStorage.removeItem('checkout-notes');
        sessionStorage.removeItem('checkout-users');
        sessionStorage.removeItem('checkout-shoot');
        transactionIdRef.current = null; // Clear ID so next checkout gets a new one

        showToast('Checkout successful!', 'success');
        router.push('/transactions');
    };

    const handleCheckout = async () => {
        // Prevent double submission using Ref (immediate) and State (render-cycle)
        if (isSubmittingRef.current || !user || cart.length === 0 || isLoading || isCheckoutLoading) return;

        if (!project.trim()) {
            showToast('Project Name is required', 'error');
            playErrorSound();
            return;
        }
        if (selectedUserIds.length === 0) {
            showToast('Select at least one user', 'error');
            playErrorSound();
            return;
        }

        // Generate ID optimistically if not already attempting one
        if (!transactionIdRef.current) {
            transactionIdRef.current = generateTransactionId();
        }

        isSubmittingRef.current = true;
        setIsLoading(true);

        try {
            const filterDeptId = user?.role === 'SUPER_ADMIN' ? department?.id : user?.departmentId;
            const targetUser = users.find(u => u.id === selectedUserIds[0]);
            
            await checkout({
                id: transactionIdRef.current, // Pass the idempotent ID
                items: cart,
                shootId: selectedShootId || undefined,
                userId: selectedUserIds[0], // Primary user
                additionalUsers: selectedUserIds.slice(1), // All other selected users
                notes: notes.trim(),
                project: project.trim(),
                displayId: transactionIdRef.current, // The readable TXN ID
                departmentId: filterDeptId,
                performerId: user?.id,
                targetUserName: targetUser?.name
            });

            handleSuccess();

        } catch (err: any) {
            console.error('Checkout error:', err);

            // ERROR RECOVERY STRATEGY

            // 1. Check for Duplicate Key (Retry Scenario)
            // If error is "duplicate key value", it means the previous attempt actually succeeded.
            if (err?.code === '23505' || err?.message?.includes('duplicate key') || err?.details?.includes('already exists')) {
                console.log('Transaction key collision detected (Idempotent Success)');
                handleSuccess();
                return;
            }

            // 2. Zombie Transaction Check (Network/Timeout Scenario)
            // If the request timed out but server processed it, the transaction might exist.
            if (transactionIdRef.current) {
                try {
                    // Assuming 'storage' is an imported or globally available object with getTransaction method
                    // You might need to import it or define it based on your project structure.
                    // For example: import * as storage from '@/lib/storage';
                    const existingTx = await storage.getTransaction(transactionIdRef.current);
                    if (existingTx) {
                        console.log('Transaction found on server despite client error (Zombie Success)');
                        handleSuccess();
                        return;
                    }
                } catch (checkErr) {
                    console.error('Failed to verify transaction existence:', checkErr);
                }
            }

            showToast('Checkout failed. Please try again.', 'error');
            setIsLoading(false);
            isSubmittingRef.current = false; // Reset lock on failure to allow retry
        }
    };


    if (authLoading || isDataLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <>
            {/* Search Bar - FIXED Position Outside Scroll View */}
            <div className="md:hidden fixed z-30 left-0 right-0 px-2 pb-2 bg-background pt-4 border-b border-border/50 shadow-sm transition-all duration-300 top-[calc(44px+env(safe-area-inset-top))]">
                <div className="flex gap-2">
                    <div className="flex-1 bg-card h-10 rounded-xl shadow-sm border border-border flex items-center overflow-hidden transition-all dark:bg-[#1c1c1e] relative">
                        {!scanInput && !isSearchFocused && (
                            <div className="absolute inset-x-0 bottom-0 h-[1px]" />
                        )}
                        <div className="pl-3 text-muted-foreground">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            placeholder="Search items..."
                            value={scanInput}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            className="flex-1 min-w-0 h-full bg-transparent border-0 px-2 text-[15px] text-foreground placeholder:text-muted-foreground focus:ring-0 transition-all focus:border-0"
                            style={{ boxShadow: 'none' }}
                        />
                        {scanInput && (
                            <button
                                onClick={() => handleInputChange('')}
                                className="pr-3 text-muted-foreground hover:text-foreground"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {isSearchFocused ? (
                        <button
                            onClick={() => {
                                window.history.back();
                            }}
                            className="h-10 px-4 shrink-0 rounded-xl flex items-center justify-center font-semibold text-sm text-primary bg-background shadow-sm border border-border active:scale-95 transition-all"
                        >
                            Done
                        </button>
                    ) : (
                        <button
                            onClick={toggleScanner}
                            className={`h-10 px-3 shrink-0 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${showScanner ? 'bg-white text-[#1d1d1f] border border-[#e5e5ea]' : 'bg-[var(--primary)] text-white shadow-[var(--primary)]/30'}`}
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M4 6h2v2H4V6zm3 0h2v2H7V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm-18 3h2v2H4V9zm3 0h2v2H7V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm-18 3h2v2H4v-2zm3 0h2v2H7v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm-18 3h2v2H4v-2zm3 0h2v2H7v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zM4 18h2v2H4v-2zm3 0h2v2H7v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2z" />
                            </svg>
                            {!showScanner && <span className="text-[14px] font-medium">Scan</span>}
                        </button>
                    )}
                </div>
            </div>

            <PullToRefresh
                onRefresh={handleRefresh}
                disabled={showScanner || isSearchFocused || isDropdownOpen}
                className="h-[calc(100dvh-110px)]"
            >
                {/* Desktop Layout */}
                <div className="hidden md:block max-w-7xl mx-auto space-y-8 pb-20">
                    <div className="flex flex-col space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight">Checkout Equipment</h1>
                        <p className="text-sm text-muted-foreground">Scan or select items to begin checkout.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="p-6" variant="glass">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                    <h3 className="font-semibold text-[17px]">Add Items</h3>
                                    <Button
                                        variant={showScanner ? 'secondary' : 'outline'}
                                        size="sm"
                                        onClick={toggleScanner}
                                    >
                                        {showScanner ? 'Hide Scanner' : 'Use Camera'}
                                    </Button>
                                </div>

                                {showScanner && (
                                    <div className="mb-6">
                                        <QRScanner
                                            onScan={handleQRScan}
                                            onError={(err) => showToast(err, 'error')}
                                            continuous={true}
                                        />
                                    </div>
                                )}

                                <div className="relative">
                                    <div className="flex gap-4">
                                        <Input
                                            placeholder="Scan barcode or enter ID..."
                                            value={scanInput}
                                            onChange={(e) => handleInputChange(e.target.value)}
                                            onFocus={() => scanInput && setShowSuggestions(suggestions.length > 0)}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            className="flex-1"
                                        />
                                        <Button onClick={() => processBarcode(scanInput)}>Add</Button>
                                    </div>

                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-2xl shadow-2xl max-h-60 overflow-auto overflow-x-hidden">
                                            {suggestions.map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => processBarcode(item.barcode, true)}
                                                    className="w-full px-4 py-3 text-left hover:bg-muted transition-colors border-b border-border last:border-0 flex items-center justify-between group"
                                                >
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        {item.serialNumber && (
                                                            <p className="text-[10px] text-primary font-medium">S/N: {item.serialNumber}</p>
                                                        )}
                                                        <p className="font-medium text-sm truncate text-foreground">{item.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{item.barcode} • {item.category}</p>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded shrink-0">{item.location}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Card>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h2 className="text-xl font-semibold">Cart ({cart.length})</h2>
                                    {cart.length > 0 && (
                                        <button
                                            onClick={handleConfirmClear}
                                            className="text-sm font-medium text-[#ff3b30] hover:underline"
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </div>

                                {cart.length === 0 ? (
                                    <div className="text-center py-16 border-2 border-dashed border-border rounded-3xl bg-muted/50">
                                        <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                        </svg>
                                        <p className="text-muted-foreground font-medium">Your cart is empty</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {cart.map((item, index) => (
                                            <div key={`${item.id}-${index}`} className="bg-card px-3 py-2.5 rounded-2xl flex items-center gap-3 shadow-sm border border-border group hover:border-primary/20 transition-all">
                                                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    {item.serialNumber && (
                                                        <p className="text-[10px] text-primary font-medium mb-0.5 leading-none">S/N: {item.serialNumber}</p>
                                                    )}
                                                    <h3 className="font-semibold truncate text-foreground text-[14px] leading-tight">{item.name}</h3>
                                                    <p className="text-[11px] text-muted-foreground truncate leading-none mt-0.5">{item.barcode} • {item.category}</p>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.id)}
                                                    className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all rounded-full"
                                                >
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-card rounded-3xl p-6 shadow-sm border border-border lg:sticky lg:top-20 overflow-visible">
                                <h3 className="text-[17px] font-bold text-foreground mb-5">Flow Details</h3>

                                <div className="space-y-5">
                                    {/* Shoot Selector - Premium Card (Moved to Top) */}
                                    <div className="relative bg-muted/40 rounded-2xl p-4 border border-border shadow-sm">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[14px] font-semibold text-foreground">Link to Shoot</p>
                                            </div>
                                        </div>

                                        <Select
                                            value={selectedShootId}
                                            onChange={(val: string) => {
                                                setSelectedShootId(val);
                                                if (val) {
                                                    const shoot = shoots.find(s => s.id === val);
                                                    if (shoot) {
                                                        setProject(shoot.title);
                                                    }
                                                } else {
                                                    setProject('');
                                                    if (user) setSelectedUserIds([user.id]);
                                                    else setSelectedUserIds([]);
                                                }
                                            }}
                                            options={activeShootOptions}
                                            placeholder="Select a shoot..."
                                            className="w-full"
                                        />
                                        {selectedShootId && (
                                            <button
                                                onClick={() => {
                                                    setSelectedShootId('');
                                                    setProject('');
                                                    if (user) setSelectedUserIds([user.id]);
                                                    else setSelectedUserIds([]);
                                                }}
                                                className="absolute top-4 right-4 p-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-muted-foreground transition-colors z-20"
                                                title="Clear selection"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}

                                        {selectedShootId && (
                                            <div className="flex items-center gap-2 mt-2.5 px-1">
                                                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <p className="text-xs font-medium text-green-700 dark:text-green-400">
                                                    Values linked to shoot
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {user && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
                                        <MultiSelect
                                            label="Checkout For"
                                            value={selectedUserIds}
                                            onChange={setSelectedUserIds}
                                            options={users
                                                .filter(u => u.status !== 'SUSPENDED')
                                                .map(u => ({
                                                    value: u.id,
                                                    label: `${u.name} (${u.role})`
                                                }))}
                                        />
                                    )}

                                    <div>
                                        <label className="text-[13px] font-semibold text-muted-foreground mb-2 block">Project Name *</label>
                                        <input
                                            type="text"
                                            placeholder="Shoot / Project Title"
                                            value={project}
                                            onChange={(e) => setProject(e.target.value)}
                                            className="w-full h-11 px-4 bg-muted text-foreground border-0 rounded-xl text-[15px] focus:ring-2 focus:ring-primary transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[13px] font-semibold text-muted-foreground mb-2 block">Notes / Other Items</label>
                                        <textarea
                                            placeholder="Any additional items or notes..."
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            className="w-full h-24 p-4 bg-muted text-foreground border-0 rounded-xl text-[15px] focus:ring-2 focus:ring-primary transition-all resize-none placeholder:text-muted-foreground/70"
                                        />
                                    </div>

                                    <div className="pt-4 border-t border-border">
                                        <div className="flex justify-between items-center mb-4 px-1">
                                            <span className="text-muted-foreground font-medium">Items</span>
                                            <span className="text-xl font-bold text-foreground">{cart.length}</span>
                                        </div>
                                        <Button
                                            onClick={handleCheckout}
                                            disabled={cart.length === 0 || isLoading}
                                            className="w-full h-12 rounded-2xl"
                                            isLoading={isLoading}
                                        >
                                            Confirm Checkout
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Layout */}
                <div className="md:hidden flex flex-col min-h-[calc(100vh-140px)] pt-[60px]">
                    {/* Project Brief */}
                    {/* Project Details Section - Premium Mobile Card */}
                    {/* Project Brief */}
                    {/* Project Details Section - Premium Mobile Card */}
                    <div className={`px-0.5 relative z-40 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${(showScanner || isSearchFocused)
                        ? 'max-h-0 opacity-0 mb-0 pt-0 overflow-hidden'
                        : 'max-h-[1200px] opacity-100 pt-4 mb-6 overflow-visible'
                        }`}>
                        <div className="bg-card rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border">
                            <div className="p-4">
                                {/* Shoot Selector for Mobile - Premium Card */}
                                <div className="relative bg-muted/40 rounded-2xl p-4 border border-border mb-4">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[14px] font-semibold text-foreground">Link to Shoot</p>
                                        </div>
                                    </div>

                                    <Select
                                        value={selectedShootId}
                                        onChange={(val: string) => {
                                            setSelectedShootId(val);
                                            if (val) {
                                                const shoot = shoots.find(s => s.id === val);
                                                if (shoot) {
                                                    setProject(shoot.title);
                                                }
                                            } else {
                                                setProject('');
                                                if (user) setSelectedUserIds([user.id]);
                                                else setSelectedUserIds([]);
                                            }
                                        }}
                                        options={activeShootOptions}
                                        placeholder="Select a shoot..."
                                        className="w-full"
                                        onOpenChange={setIsDropdownOpen}
                                    />

                                    {selectedShootId && (
                                        <button
                                            onClick={() => {
                                                setSelectedShootId('');
                                                setProject('');
                                                if (user) setSelectedUserIds([user.id]);
                                                else setSelectedUserIds([]);
                                            }}
                                            className="absolute top-4 right-4 p-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-muted-foreground transition-colors z-20"
                                            title="Clear selection"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>

                                {user && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
                                    <div className="mb-4">
                                        <div className="relative z-20">
                                            <MultiSelect
                                                label="Checkout For"
                                                value={selectedUserIds}
                                                onChange={setSelectedUserIds}
                                                options={users.map(u => ({
                                                    value: u.id,
                                                    label: `${u.name} (${u.role})`
                                                }))}
                                                onOpenChange={setIsDropdownOpen}
                                            />
                                        </div>
                                    </div>
                                )}

                                <label className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 block pl-1">
                                    Project / Shoot Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Documentary Shoot A"
                                    value={project}
                                    onChange={(e) => setProject(e.target.value)}
                                    className="w-full h-12 px-4 bg-muted text-foreground border-0 rounded-2xl text-[16px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all shadow-inner mb-4"
                                />


                                {/* Notes Section - Always Open */}
                                <div className="mt-2">
                                    <div className="mb-2 pl-1">
                                        <label className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">
                                            Notes / Other Items
                                        </label>
                                    </div>
                                    <textarea
                                        placeholder="List any items not in inventory..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full h-14 p-3 bg-muted text-foreground border-0 rounded-2xl text-[16px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all shadow-inner resize-none appearance-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 pb-40">
                        {/* Scanner View (Inline) - Moved inside scrollable area to push content down */}
                        <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${showScanner ? 'max-h-[500px] opacity-100 mb-6' : 'max-h-0 opacity-0'}`}>
                            <div className="mx-5 relative z-10">
                                <div className="h-[360px] rounded-[32px] overflow-hidden shadow-[0_20px_40px_-12px_rgba(0,0,0,0.3)] border border-border transform translate-z-0">
                                    {showScanner && (
                                        <MobileScanner
                                            onScan={handleQRScan}
                                            onError={(err) => showToast(err, 'error')}
                                            onClose={() => window.history.back()}
                                            autoStart={true}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {showSuggestions && suggestions.length > 0 && (
                            <div className="mb-6 bg-card rounded-3xl overflow-hidden shadow-xl border border-border">
                                {suggestions.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => processBarcode(item.barcode, true)}
                                        className="w-full p-4 flex items-center gap-4 text-left active:bg-muted border-b border-border"
                                    >
                                        <div className="w-11 h-11 bg-muted rounded-xl flex items-center justify-center shrink-0">
                                            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeWidth={2} />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {item.serialNumber && (
                                                <p className="text-[10px] text-primary font-medium">S/N: {item.serialNumber}</p>
                                            )}
                                            <p className="font-bold truncate text-[16px] text-foreground">{item.name}</p>
                                            <p className="text-sm text-muted-foreground truncate">{item.barcode}</p>
                                        </div>
                                        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path d="M12 4v16m8-8H4" />
                                            </svg>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {!isSearchFocused && (
                            <div className="space-y-2 mt-4">
                                {cart.length > 0 && (
                                    <div className="flex items-center justify-between px-1 mb-2">
                                        <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                                            Added Items ({cart.length})
                                        </h3>
                                        <button
                                            onClick={handleConfirmClear}
                                            className="text-[11px] font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded-md active:bg-red-500/20"
                                        >
                                            CLEAR ALL
                                        </button>
                                    </div>
                                )}
                                {cart.map((item, index) => (
                                    <div key={item.id} className="bg-card px-3 py-2.5 rounded-2xl flex items-center gap-3 shadow-sm border border-border">
                                        <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {item.serialNumber && (
                                                <p className="text-[9px] text-primary font-medium mb-0 leading-none">S/N: {item.serialNumber}</p>
                                            )}
                                            <p className="font-bold truncate text-foreground text-[14px] leading-tight">{item.name}</p>
                                            <p className="text-[11px] text-muted-foreground truncate leading-none mt-0.5">{item.barcode}</p>
                                        </div>
                                        <button
                                            onClick={() => removeFromCart(item.id)}
                                            className="w-8 h-8 flex items-center justify-center text-destructive active:scale-90 transition-all rounded-full hover:bg-destructive/10"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </PullToRefresh>

            {/* Mobile Bottom Bar */}
            {!isSearchFocused && (
                <div className="md:hidden fixed bottom-[calc(70px+env(safe-area-inset-bottom))] left-0 right-0 p-4 bg-background border-t border-border shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] z-30">
                    <div className="flex items-center gap-4">
                        <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Total</p>
                            <p className="text-[24px] font-bold text-foreground leading-none">{cart.length}</p>
                        </div>
                        <button
                            onClick={handleCheckout}
                            disabled={cart.length === 0 || isLoading}
                            className="flex-1 h-[48px] bg-[var(--primary)] text-white rounded-xl text-[16px] font-bold shadow-xl shadow-[var(--primary)]/20 disabled:opacity-40 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                        >
                            {isLoading ? (
                                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : 'Confirm Checkout'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
