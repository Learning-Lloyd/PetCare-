import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ViewType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PawPrint, User, Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { gsap } from 'gsap';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { attemptAdminRegistration } from '@/lib/authFlows';
import { Spinner } from '@/components/ui/spinner';

interface RegisterPageProps {
  onNavigate: (view: ViewType) => void;
}

export default function RegisterPage({ onNavigate }: RegisterPageProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  /** After account is created: sign-in + redirect (spinner overlay). */
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Entrance animation
    const ctx = gsap.context(() => {
      gsap.fromTo(cardRef.current,
        { opacity: 0, y: 24, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power2.out' }
      );
      
      gsap.fromTo('.register-input',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, delay: 0.2, ease: 'power2.out' }
      );
      
      gsap.fromTo('.register-button',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, delay: 0.5, ease: 'power2.out' }
      );
    });
    
    return () => ctx.revert();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    const emailTrim = email.trim();
    setIsLoading(true);
    const result = await attemptAdminRegistration(name.trim(), emailTrim, password);
    if (!result.ok) {
      toast.error('Registration failed', { description: result.message });
      if (result.message) setStatusMessage(result.message);
      setIsLoading(false);
      return;
    }

    toast.success('Account created', { description: 'Signing you in…' });
    setIsSigningIn(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailTrim.toLowerCase(),
      password,
    });
    if (signInError) {
      toast.error('Could not sign in', {
        description: signInError.message + ' Try logging in manually.',
      });
      setStatusMessage('Account created. Please go to Login and sign in.');
      setIsSigningIn(false);
      setIsLoading(false);
      return;
    }

    await new Promise((r) => setTimeout(r, 450));
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center relative overflow-hidden p-4">
      {isSigningIn ? (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#F6F8FC]/90 backdrop-blur-[2px]"
          aria-busy="true"
          aria-live="polite"
        >
          <Spinner className="size-10 text-[#2B6CB0] animate-spin" aria-label="Signing you in" />
          <p className="text-sm font-medium text-[#1A202C]">Signing you in…</p>
          <p className="text-xs text-[#5A6B7A]">Taking you to your dashboard</p>
        </div>
      ) : null}
      {/* Paw Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06]">
        <PawPrint className="w-[600px] h-[600px] text-[#1A3A5C]" strokeWidth={0.5} />
      </div>

      {/* Header Logo */}
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <PawPrint className="w-6 h-6 text-[#2B6CB0]" />
        <span className="text-lg font-semibold text-[#2B6CB0]">PetCare+</span>
      </div>

      <div className="absolute top-6 right-6 flex items-center gap-4">
        <button 
          onClick={() => onNavigate('login')}
          className="text-sm text-[#5A6B7A] hover:text-[#1A202C]"
        >
          Login
        </button>
        <button 
          onClick={() => onNavigate('register')}
          className="text-sm text-[#2B6CB0] font-medium"
        >
          Sign Up
        </button>
      </div>

      {/* Register Card */}
      <div 
        ref={cardRef}
        className="w-full max-w-[420px] bg-white rounded-[18px] shadow-[0_10px_30px_rgba(30,60,90,0.08)] p-8 relative z-10"
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-[#EAF2FF] rounded-full flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-[#2B6CB0]" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold text-[#1A202C] mb-1">Join the Sanctuary</h2>
          <p className="text-sm text-[#5A6B7A]">Begin your pet's premium health journey today.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          {statusMessage ? (
            <div className="register-input rounded-xl border border-[#D6E3F0] bg-[#F3F7FB] px-3 py-2 text-sm text-[#1A202C]">
              {statusMessage}
            </div>
          ) : null}
          <div className="register-input space-y-2">
            <Label htmlFor="name" className="text-xs font-medium text-[#5A6B7A] uppercase tracking-wide">
              Full Name
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A6B7A]" />
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10 h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                required
              />
            </div>
          </div>

          <div className="register-input space-y-2">
            <Label htmlFor="email" className="text-xs font-medium text-[#5A6B7A] uppercase tracking-wide">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A6B7A]" />
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                required
              />
            </div>
          </div>

          <div className="register-input space-y-2">
            <Label htmlFor="password" className="text-xs font-medium text-[#5A6B7A] uppercase tracking-wide">
              Password
            </Label>
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

          <div className="register-input space-y-2">
            <Label htmlFor="confirmPassword" className="text-xs font-medium text-[#5A6B7A] uppercase tracking-wide">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A6B7A]" />
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading || isSigningIn}
            className="register-button w-full h-12 bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl font-medium mt-2"
          >
            {isSigningIn ? 'Signing you in…' : isLoading ? 'Creating account…' : 'Register'}
          </Button>
        </form>

        {/* Terms */}
        <p className="mt-4 text-xs text-center text-[#5A6B7A]">
          By clicking register, you agree to our{' '}
          <button className="text-[#2B6CB0] hover:underline">Terms of Service</button>
          {' '}and{' '}
          <button className="text-[#2B6CB0] hover:underline">Privacy Policy</button>.
        </p>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-[#D6E3F0] text-center">
          <p className="text-sm text-[#5A6B7A]">
            Already have an account?{' '}
            <button 
              onClick={() => onNavigate('login')}
              className="text-[#2B6CB0] font-medium hover:underline"
            >
              Back to Login →
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
