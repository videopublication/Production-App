'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from './Button';

export const Navbar = () => {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    const NavLinks = () => (
        <>
            {user && (
                <Link href="/inventory" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant={isActive('/inventory') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                        Inventory
                    </Button>
                </Link>
            )}
            {(user?.role === 'CREW' || user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                <>
                    <Link href="/checkout" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/checkout') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Checkout
                        </Button>
                    </Link>
                    <Link href="/returns" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/returns') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Returns
                        </Button>
                    </Link>
                </>
            )}
            {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                <>
                    <Link href="/verification" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/verification') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Verification
                        </Button>
                    </Link>
                    <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant={isActive('/dashboard') ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start md:w-auto">
                            Dashboard
                        </Button>
                    </Link>
                </>
            )}
        </>
    );

    return (
        <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <div className="flex items-center">
                        <Link href="/" className="flex items-center space-x-2 group">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                                <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Vpub App</span>
                        </Link>

                        <div className="hidden md:flex ml-10 space-x-2">
                            <NavLinks />
                        </div>
                    </div>

                    <div className="flex items-center space-x-4">
                        <div className="hidden md:flex items-center space-x-4">
                            {user ? (
                                <div className="flex items-center space-x-4">
                                    <div className="text-sm text-right">
                                        <p className="font-medium leading-none">{user.name}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{user.role}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={logout}>
                                        Logout
                                    </Button>
                                </div>
                            ) : (
                                <Link href="/login">
                                    <Button variant="primary" size="sm">
                                        Login
                                    </Button>
                                </Link>
                            )}
                        </div>

                        {/* Mobile menu button */}
                        <div className="md:hidden">
                            <Button variant="ghost" size="sm" onClick={toggleMobileMenu}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {isMobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl animate-accordion-down overflow-hidden">
                    <div className="px-4 pt-2 pb-4 space-y-1 flex flex-col">
                        <NavLinks />
                        <div className="pt-4 mt-4 border-t border-border/40">
                            {user ? (
                                <div className="flex items-center justify-between px-2">
                                    <div>
                                        <p className="font-medium">{user.name}</p>
                                        <p className="text-xs text-muted-foreground">{user.role}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => { logout(); setIsMobileMenuOpen(false); }}>
                                        Logout
                                    </Button>
                                </div>
                            ) : (
                                <div className="px-2">
                                    <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                                        <Button className="w-full">Login</Button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};
