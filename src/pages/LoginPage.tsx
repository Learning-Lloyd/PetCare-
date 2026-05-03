import { useState, useEffect, useRef } from 'react';
import type { ViewType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PawPrint, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { gsap } from 'gsap';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void | Promise<void>;
  onNavigate: (view: ViewType) => void;
}

export default function LoginPage({ onLogin, onNavigate }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const pawRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Entrance animation
    const ctx = gsap.context(() => {
      gsap.fromTo(cardRef.current,
        { opacity: 0, y: 24, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power2.out' }
      );
      
      gsap.fromTo('.login-input',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, delay: 0.2, ease: 'power2.out' }
      );
      
      gsap.fromTo('.login-button',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, delay: 0.4, ease: 'power2.out' }
      );
    });
    
    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    await onLogin(email, password);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center relative overflow-hidden p-4">
      {/* Paw Watermark */}
      <div 
        ref={pawRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06]"
      >
        <PawPrint className="w-[600px] h-[600px] text-[#1A3A5C]" strokeWidth={0.5} />
      </div>

      {/* Login Card */}
      <div 
        ref={cardRef}
        className="w-full max-w-[420px] bg-white rounded-[18px] shadow-[0_10px_30px_rgba(30,60,90,0.08)] p-8 relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <PawPrint className="w-8 h-8 text-[#2B6CB0]" />
            <span className="text-2xl font-bold text-[#2B6CB0]">PetCare+</span>
          </div>
          <p className="text-xs text-[#5A6B7A] tracking-wider">THE CLINICAL SANCTUARY</p>
        </div>

        {/* Title */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-[#1A202C] mb-1">Welcome Back</h2>
          <p className="text-sm text-[#5A6B7A]">Please sign in to access your pet's health portal.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="login-input space-y-2">
            <Label htmlFor="email" className="text-xs font-medium text-[#5A6B7A] uppercase tracking-wide">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A6B7A]" />
              <Input
                id="email"
                type="email"
                placeholder="yourname@sanctuary.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                required
              />
            </div>
          </div>

          <div className="login-input space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium text-[#5A6B7A] uppercase tracking-wide">
                Password
              </Label>
              <button type="button" className="text-xs text-[#2B6CB0] hover:underline">
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A6B7A]" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6B7A] hover:text-[#1A202C]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="login-button w-full h-12 bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl font-medium"
          >
            {isLoading ? 'Signing in...' : 'Login'}
          </Button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-[#5A6B7A]">
            Don't have an account yet?{' '}
            <button 
              onClick={() => onNavigate('register')}
              className="text-[#2B6CB0] font-medium hover:underline"
            >
              Create Account
            </button>
          </p>
        </div>

        {/* Accreditation Badge */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#F3F7FB] rounded-full">
            <div className="w-4 h-4 bg-[#2B6CB0] rounded-full flex items-center justify-center">
              <span className="text-[8px] text-white font-bold">✓</span>
            </div>
            <span className="text-xs text-[#5A6B7A] font-medium tracking-wide">AAHA ACCREDITED PLATFORM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
