'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user) {
      if (user.role === 'MANAGER' || user.role === 'ADMIN') {
        router.push('/dashboard');
      } else {
        router.push('/checkout');
      }
    }
  }, [user, router]);

  if (user) {
    return null; // Or a loading spinner
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background overflow-hidden px-4 sm:px-6">
      {/* Hero Section */}
      <div className="relative w-full py-12 sm:py-24 md:py-32 lg:py-40 text-center">
        {/* Mesh Gradient Background */}
        <div className="absolute inset-0 -z-10 mesh-gradient-hero opacity-60 blur-3xl" />

        <div className="mx-auto max-w-7xl relative z-10">
          <div className="mx-auto max-w-4xl flex flex-col items-center">
            <div className="mb-6 sm:mb-8 flex justify-center animate-fade-in opacity-0" style={{ animationDelay: '0.1s' }}>
              <span className="rounded-full bg-white/50 backdrop-blur-md border border-white/20 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-medium text-foreground shadow-sm">
                New Version 2.0
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-semibold tracking-tight text-foreground animate-slide-up opacity-0 px-2" style={{ animationDelay: '0.2s', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
              Equipment management. <br />
              <span className="text-gradient-blue">Reimagined.</span>
            </h1>

            <p className="mt-6 sm:mt-8 text-base sm:text-lg md:text-xl font-normal text-muted-foreground max-w-2xl animate-slide-up opacity-0 px-4" style={{ animationDelay: '0.4s', lineHeight: '1.6' }}>
              Effortlessly track, manage, and maintain your production inventory with a system designed for clarity, speed, and precision.
            </p>

            <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-x-6 w-full sm:w-auto animate-slide-up opacity-0 px-4" style={{ animationDelay: '0.6s' }}>
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto rounded-full px-8 sm:px-10 text-base sm:text-[17px] shadow-lg hover:shadow-xl transition-all duration-300 bg-[#0071e3] hover:bg-[#0077ed]">
                  Get Started
                </Button>
              </Link>
              <Link href="/about" className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto rounded-full px-8 sm:px-10 text-base sm:text-[17px] bg-white/50 backdrop-blur-sm border-white/40">
                  Learn more
                </Button>
              </Link>
            </div>

            {/* Floating Elements for Visual Interest - Hidden on mobile for cleaner look */}
            <div className="hidden sm:block absolute top-1/2 left-10 w-24 h-24 bg-blue-400/20 rounded-full blur-2xl animate-float" style={{ animationDelay: '0s' }} />
            <div className="hidden sm:block absolute bottom-10 right-10 w-32 h-32 bg-purple-400/20 rounded-full blur-2xl animate-float" style={{ animationDelay: '2s' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
