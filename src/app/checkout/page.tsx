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
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { generateTransactionId } from '@/lib/id';

export default function CheckoutPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [cart, setCart] = useState<Equipment[]>([]);
    const [scanInput, setScanInput] = useState('');
    const [project, setProject] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedShootId, setSelectedShootId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

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

    const toggleScanner = () => {
        if (showScanner) {
            window.history.back(); // This triggers popstate -> closes scanner
        } else {
            setShowScanner(true);
        }
    };
    const [suggestions, setSuggestions] = useState<Equipment[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [shoots, setShoots] = useState<Shoot[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    // Redirect if not authorized
    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            router.push('/login');
            return;
        }

        if (!['CREW', 'MANAGER', 'ADMIN'].includes(user.role)) {
            router.push('/');
        }
    }, [user, router, authLoading]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Fetch equipment, users, and shoots on mount
    useEffect(() => {
        const fetchData = async () => {
            const items = await storage.getEquipment();
            setEquipmentList(items);

            // Fetch shoots for selection
            const allShoots = await storage.getShoots();
            setShoots(allShoots);

            if (user && ['MANAGER', 'ADMIN'].includes(user.role)) {
                const userList = await storage.getUsers();
                setUsers(userList);
            }
        };
        fetchData();
    }, [user]);

    // Filter to active and upcoming shoots only
    const availableShoots = useMemo(() => {
        const now = new Date();
        return shoots.filter(shoot => {
            // Exclude cancelled shoots
            if (shoot.status === 'CANCELLED') return false;
            // Include shoots that haven't ended yet
            if (shoot.endTime && new Date(shoot.endTime) < now) return false;
            return true;
        }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [shoots]);

    // Initialize/Load State (Session Persistence)
    useEffect(() => {
        const savedCart = sessionStorage.getItem('checkout-cart');
        if (savedCart) {
            try { setCart(JSON.parse(savedCart)); } catch { sessionStorage.removeItem('checkout-cart'); }
        }

        const savedProject = sessionStorage.getItem('checkout-project');
        if (savedProject) setProject(savedProject);

        const savedNotes = sessionStorage.getItem('checkout-notes');
        if (savedNotes) setNotes(savedNotes);

        const savedShootId = sessionStorage.getItem('checkout-shoot');
        if (savedShootId) setSelectedShootId(savedShootId);

        const savedUsers = sessionStorage.getItem('checkout-users');
        if (savedUsers) {
            try { setSelectedUserIds(JSON.parse(savedUsers)); } catch { }
        } else if (user) {
            setSelectedUserIds([user.id]);
        }
    }, [user]);

    useEffect(() => {
        if (user && selectedUserIds.length === 0 && !sessionStorage.getItem('checkout-users')) {
            setSelectedUserIds([user.id]);
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

    const processBarcode = (barcode: string) => {
        const normalizedBarcode = barcode.trim();
        const now = Date.now();
        if (lastProcessedRef.current &&
            lastProcessedRef.current.code.toLowerCase() === normalizedBarcode.toLowerCase() &&
            now - lastProcessedRef.current.time < 2000) {
            return;
        }

        if (!normalizedBarcode) return;

        const item = equipmentList.find(i =>
            i.barcode.toLowerCase() === normalizedBarcode.toLowerCase() ||
            i.id === normalizedBarcode
        );

        if (!item) {
            showToast('Item not found', 'error');
            playErrorSound();
            lastProcessedRef.current = { code: normalizedBarcode, time: now };
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
            lastProcessedRef.current = { code: normalizedBarcode, time: now };
            return;
        }

        if (cart.find(i => i.id === item.id)) {
            const serialInfo = item.serialNumber ? ` (S/N: ${item.serialNumber})` : '';
            showToast(`Item "${item.name}"${serialInfo} is already in cart`, 'info');
            playErrorSound();
            lastProcessedRef.current = { code: normalizedBarcode, time: now };
            return;
        }

        setCart(prev => [...prev, item]);
        showToast(`Added "${item.name}"`, 'success');
        playSuccessSound();

        setScanInput('');
        setSuggestions([]);
        setShowSuggestions(false);
        lastProcessedRef.current = { code: normalizedBarcode, time: now };
    };

    const handleInputChange = (value: string) => {
        setScanInput(value);
        if (value.trim().length > 0) {
            const filtered = equipmentList.filter(item =>
                item.status === 'AVAILABLE' &&
                !cart.find(c => c.id === item.id) &&
                (
                    item.name.toLowerCase().includes(value.toLowerCase()) ||
                    item.barcode.toLowerCase().includes(value.toLowerCase()) ||
                    item.category.toLowerCase().includes(value.toLowerCase())
                )
            ).slice(0, 5);
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleQRScan = (decodedText: string) => {
        try {
            const data = JSON.parse(decodedText);
            processBarcode(data.barcode || data.id || decodedText);
        } catch {
            processBarcode(decodedText);
        }
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(i => i.id !== id));
        showToast('Item removed', 'info');
    };

    const handleConfirmClear = async () => {
        const isConfirmed = await confirm({
            title: 'Clear Cart?',
            message: 'Are you sure you want to remove all items?',
            confirmLabel: 'Clear All',
            variant: 'danger'
        });

        if (isConfirmed) {
            setCart([]);
            sessionStorage.removeItem('checkout-cart');
            showToast('Cart cleared', 'info');
        }
    };

    const handleCheckout = async () => {
        if (!user || cart.length === 0) return;
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

        setIsLoading(true);
        try {
            const transaction: Transaction = {
                id: generateTransactionId(),
                userId: selectedUserIds[0],
                additionalUsers: selectedUserIds.slice(1),
                items: cart.map(i => i.id),
                timestampOut: new Date().toISOString(),
                project: project.trim(),
                shootId: selectedShootId || undefined,
                notes: notes.trim(),
                preCheckoutConditions: cart.reduce((acc, item) => ({
                    ...acc,
                    [item.id]: item.condition
                }), {}),
                status: 'OPEN'
            };

            await storage.saveTransaction(transaction);

            const primaryUser = users.find(u => u.id === selectedUserIds[0]);
            const primaryName = primaryUser ? primaryUser.name : (user?.id === selectedUserIds[0] ? user.name : 'Selected User');
            const shootInfo = selectedShootId ? shoots.find(s => s.id === selectedShootId)?.title : null;

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'CHECKOUT',
                entityId: transaction.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Checkout [${transaction.id}]: ${cart.length} items for "${project.trim()}"${shootInfo ? ` (Shoot: ${shootInfo})` : ''} (To: ${primaryName})`
            });

            await Promise.all(cart.map(item =>
                storage.updateEquipment(item.id, {
                    status: 'CHECKED_OUT',
                    assignedTo: selectedUserIds[0],
                    lastActivity: new Date().toISOString()
                })
            ));

            setCart([]);
            setSelectedShootId('');
            sessionStorage.removeItem('checkout-cart');
            sessionStorage.removeItem('checkout-project');
            sessionStorage.removeItem('checkout-notes');
            sessionStorage.removeItem('checkout-users');
            sessionStorage.removeItem('checkout-shoot');

            showToast('Checkout successful!', 'success');
            router.push('/transactions');
        } catch (err) {
            console.error(err);
            showToast('Checkout failed', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Desktop Layout */}
            <div className="hidden md:block max-w-4xl mx-auto space-y-8 pb-20">
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
                                    <div className="absolute z-50 w-full mt-2 bg-white border border-[#e5e5ea] rounded-2xl shadow-2xl max-h-60 overflow-auto overflow-x-hidden">
                                        {suggestions.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => processBarcode(item.barcode)}
                                                className="w-full px-4 py-3 text-left hover:bg-[#f2f2f7] transition-colors border-b border-[#f2f2f7] last:border-0 flex items-center justify-between group"
                                            >
                                                <div className="flex-1 min-w-0 pr-4">
                                                    {item.serialNumber && (
                                                        <p className="text-[10px] text-[#007aff] font-medium">S/N: {item.serialNumber}</p>
                                                    )}
                                                    <p className="font-medium text-sm truncate">{item.name}</p>
                                                    <p className="text-xs text-[#8e8e93] truncate">{item.barcode} • {item.category}</p>
                                                </div>
                                                <span className="text-xs text-[#8e8e93] bg-[#f2f2f7] px-2 py-1 rounded shrink-0">{item.location}</span>
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
                                <div className="text-center py-16 border-2 border-dashed border-[#e5e5ea] rounded-3xl bg-[#f5f5f7]/50">
                                    <svg className="w-12 h-12 mx-auto mb-4 text-[#c7c7cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                    <p className="text-[#8e8e93] font-medium">Your cart is empty</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {cart.map((item, index) => (
                                        <Card key={`${item.id}-${index}`} className="p-4 group border border-[#e5e5ea]">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-[#f2f2f7] rounded-xl flex items-center justify-center text-[#1d1d1f] font-bold shrink-0">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    {item.serialNumber && (
                                                        <p className="text-[10px] text-[#007aff] font-medium mb-0.5">S/N: {item.serialNumber}</p>
                                                    )}
                                                    <h3 className="font-semibold truncate">{item.name}</h3>
                                                    <p className="text-sm text-[#8e8e93] truncate">{item.barcode} • {item.category}</p>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.id)}
                                                    className="p-2 text-[#8e8e93] hover:text-[#ff3b30] transition-colors"
                                                >
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#e5e5ea] lg:sticky lg:top-20">
                            <h3 className="text-[17px] font-bold text-[#1d1d1f] mb-5">Flow Details</h3>

                            <div className="space-y-5">
                                {user && ['MANAGER', 'ADMIN'].includes(user.role) && (
                                    <MultiSelect
                                        label="Assign To"
                                        value={selectedUserIds}
                                        onChange={setSelectedUserIds}
                                        options={users.map(u => ({
                                            value: u.id,
                                            label: `${u.name} (${u.role})`
                                        }))}
                                    />
                                )}

                                {/* Shoot Selector - Premium Card */}
                                {availableShoots.length > 0 && (
                                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-bold text-indigo-900">Link to Shoot</p>
                                                <p className="text-[11px] text-indigo-600/70">Optional • Auto-fills project name</p>
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={selectedShootId}
                                                onChange={(e) => {
                                                    const shootId = e.target.value;
                                                    setSelectedShootId(shootId);
                                                    if (shootId) {
                                                        const shoot = availableShoots.find(s => s.id === shootId);
                                                        if (shoot && !project.trim()) {
                                                            setProject(shoot.title);
                                                        }
                                                    }
                                                }}
                                                className={`w-full h-11 px-4 pr-10 border-0 rounded-xl text-[14px] font-medium focus:ring-2 focus:ring-indigo-400 transition-all appearance-none cursor-pointer ${selectedShootId
                                                    ? 'bg-white text-indigo-900 shadow-sm'
                                                    : 'bg-white/60 text-[#8e8e93]'
                                                    }`}
                                            >
                                                <option value="">Select a shoot...</option>
                                                {availableShoots.map(shoot => (
                                                    <option key={shoot.id} value={shoot.id}>
                                                        📽 {shoot.title} — {new Date(shoot.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {shoot.location ? `@ ${shoot.location}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                                                </svg>
                                            </div>
                                        </div>
                                        {selectedShootId && (
                                            <div className="flex items-center gap-2 mt-2.5 px-1">
                                                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <p className="text-xs font-medium text-green-700">
                                                    Equipment will be linked to this shoot
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label className="text-[13px] font-semibold text-[#8e8e93] mb-2 block">Project Name *</label>
                                    <input
                                        type="text"
                                        placeholder="Shoot / Project Title"
                                        value={project}
                                        onChange={(e) => setProject(e.target.value)}
                                        className="w-full h-11 px-4 bg-[#f2f2f7] border-0 rounded-xl text-[15px] focus:ring-2 focus:ring-[#0071e3] transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="text-[13px] font-semibold text-[#8e8e93] mb-2 block">Notes / Other Items</label>
                                    <textarea
                                        placeholder="Any additional items or notes..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full h-24 p-4 bg-[#f2f2f7] border-0 rounded-xl text-[15px] focus:ring-2 focus:ring-[#0071e3] transition-all resize-none placeholder:text-[#8e8e93]/70"
                                    />
                                </div>

                                <div className="pt-4 border-t border-[#f2f2f7]">
                                    <div className="flex justify-between items-center mb-4 px-1">
                                        <span className="text-[#8e8e93] font-medium">Items</span>
                                        <span className="text-xl font-bold text-[#1d1d1f]">{cart.length}</span>
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
            <div className="md:hidden flex flex-col min-h-[calc(100vh-140px)]">
                {/* Project Brief */}
                {/* Project Details Section - Premium Mobile Card */}
                <div className="px-5 pt-4 pb-0 relative z-20 animate-in slide-in-from-top-4 duration-300 mb-6">
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#e5e5ea]">
                        {user && ['MANAGER', 'ADMIN'].includes(user.role) && (
                            <div className="p-4 border-b border-[#f5f5f7]">
                                <MultiSelect
                                    label="Checkout For"
                                    value={selectedUserIds}
                                    onChange={setSelectedUserIds}
                                    options={users.map(u => ({
                                        value: u.id,
                                        label: `${u.name} (${u.role})`
                                    }))}
                                />
                            </div>
                        )}
                        <div className="p-4">
                            {/* Shoot Selector for Mobile - Premium Card */}
                            {availableShoots.length > 0 && (
                                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100 mb-4">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[14px] font-bold text-indigo-900">Link to Shoot</p>
                                            <p className="text-[11px] text-indigo-600/70">Optional • Auto-fills project name</p>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <select
                                            value={selectedShootId}
                                            onChange={(e) => {
                                                const shootId = e.target.value;
                                                setSelectedShootId(shootId);
                                                if (shootId) {
                                                    const shoot = availableShoots.find(s => s.id === shootId);
                                                    if (shoot && !project.trim()) {
                                                        setProject(shoot.title);
                                                    }
                                                }
                                            }}
                                            className={`w-full h-12 px-4 pr-10 border-0 rounded-xl text-[15px] font-medium focus:ring-2 focus:ring-indigo-400 transition-all appearance-none cursor-pointer ${selectedShootId
                                                    ? 'bg-white text-indigo-900 shadow-sm'
                                                    : 'bg-white/60 text-[#8e8e93]'
                                                }`}
                                        >
                                            <option value="">Select a shoot...</option>
                                            {availableShoots.map(shoot => (
                                                <option key={shoot.id} value={shoot.id}>
                                                    📽 {shoot.title} — {new Date(shoot.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                                            </svg>
                                        </div>
                                    </div>
                                    {selectedShootId && (
                                        <div className="flex items-center gap-2 mt-3 px-1">
                                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <p className="text-[13px] font-medium text-green-700">
                                                Equipment will be linked to this shoot
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <label className="text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-2 block pl-1">
                                Project / Shoot Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Documentary Shoot A"
                                value={project}
                                onChange={(e) => setProject(e.target.value)}
                                className="w-full h-12 px-4 bg-[#f5f5f7] border-0 rounded-2xl text-[16px] text-[#1d1d1f] placeholder:text-[#8e8e93] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white transition-all shadow-inner mb-4"
                            />

                            <label className="text-[13px] font-semibold text-[#86868b] uppercase tracking-wide mb-2 block pl-1">
                                Notes / Other Items
                            </label>
                            <textarea
                                placeholder="List any items not in inventory..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full h-24 p-4 bg-[#f5f5f7] border-0 rounded-2xl text-[16px] text-[#1d1d1f] placeholder:text-[#8e8e93] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white transition-all shadow-inner resize-none appearance-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Scanner View (Inline) */}
                <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${showScanner ? 'max-h-[500px] opacity-100 mb-6' : 'max-h-0 opacity-0'}`}>
                    <div className="mx-5 relative z-10">
                        <div className="h-[360px] rounded-[32px] overflow-hidden shadow-[0_20px_40px_-12px_rgba(0,0,0,0.3)] border border-[#e5e5ea] transform translate-z-0">
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

                <div className="flex-1 overflow-auto pb-40">
                    <div className="px-5 py-2">
                        <div className="flex gap-3 mb-6">
                            <input
                                placeholder="Search or type barcode..."
                                value={scanInput}
                                onChange={(e) => handleInputChange(e.target.value)}
                                className="flex-1 min-w-0 h-14 px-5 bg-[#f2f2f7] border-0 rounded-2xl text-[16px] focus:bg-white focus:ring-2 focus:ring-[#0071e3] transition-all shadow-sm"
                            />
                            <button
                                onClick={toggleScanner}
                                className={`h-14 px-6 shrink-0 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${showScanner ? 'bg-[#f2f2f7] text-[#1d1d1f]' : 'bg-[#0071e3] text-white shadow-[#0071e3]/30'}`}
                            >
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M4 6h2v2H4V6zm3 0h2v2H7V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm3 0h2v2h-2V6zm-18 3h2v2H4V9zm3 0h2v2H7V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm-18 3h2v2H4v-2zm3 0h2v2H7v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm-18 3h2v2H4v-2zm3 0h2v2H7v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zM4 18h2v2H4v-2zm3 0h2v2H7v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2z" />
                                </svg>
                                <span className="font-bold text-[16px]">{showScanner ? 'Close' : 'Scan'}</span>
                            </button>
                        </div>

                        {showSuggestions && suggestions.length > 0 && (
                            <div className="mb-6 bg-white rounded-3xl overflow-hidden shadow-xl border border-[#e5e5ea]">
                                {suggestions.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => processBarcode(item.barcode)}
                                        className="w-full p-4 flex items-center gap-4 text-left active:bg-[#f2f2f7] border-b border-[#f2f2f7]"
                                    >
                                        <div className="w-11 h-11 bg-[#f2f2f7] rounded-xl flex items-center justify-center shrink-0">
                                            <svg className="w-5 h-5 text-[#8e8e93]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeWidth={2} />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {item.serialNumber && (
                                                <p className="text-[10px] text-[#007aff] font-medium">S/N: {item.serialNumber}</p>
                                            )}
                                            <p className="font-bold truncate text-[16px]">{item.name}</p>
                                            <p className="text-sm text-[#8e8e93] truncate">{item.barcode}</p>
                                        </div>
                                        <div className="w-7 h-7 rounded-full bg-[#0071e3] flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path d="M12 4v16m8-8H4" />
                                            </svg>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="space-y-3">
                            {cart.map((item, index) => (
                                <div key={item.id} className="bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-[#e5e5ea]/50">
                                    <div className="w-10 h-10 bg-[#0071e3] text-white rounded-xl flex items-center justify-center font-bold shadow-md">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {item.serialNumber && (
                                            <p className="text-[10px] text-[#007aff] font-medium mb-0.5">S/N: {item.serialNumber}</p>
                                        )}
                                        <p className="font-bold truncate">{item.name}</p>
                                        <p className="text-sm text-[#8e8e93] truncate">{item.barcode}</p>
                                    </div>
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="w-10 h-10 flex items-center justify-center text-[#ff3b30] active:scale-90 transition-all"
                                    >
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Bar */}
                <div className="fixed bottom-20 left-0 right-0 p-5 pt-4 bg-white/95 backdrop-blur-2xl border-t border-[#e5e5ea]/50 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center gap-5">
                        <div>
                            <p className="text-[12px] font-bold text-[#8e8e93] uppercase">Total</p>
                            <p className="text-[28px] font-bold text-[#1d1d1f] leading-none">{cart.length}</p>
                        </div>
                        <button
                            onClick={handleCheckout}
                            disabled={cart.length === 0 || isLoading}
                            className="flex-1 h-[56px] bg-[#0071e3] text-white rounded-2xl text-[18px] font-bold shadow-xl shadow-[#0071e3]/20 disabled:opacity-40 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                        >
                            {isLoading ? (
                                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : 'Confirm Checkout'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
