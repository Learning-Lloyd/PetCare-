import { useState, useEffect, useRef } from 'react';
import type { ViewType, User } from '@/types';
import { User as UserIcon, Shield, Info, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';

gsap.registerPlugin(ScrollTrigger);

interface SettingsPageProps {
  onNavigate: (view: ViewType) => void;
  user: User | null;
  onUpdateUser: (user: User) => void;
}

export default function SettingsPage({ onNavigate: _onNavigate, user, onUpdateUser }: SettingsPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.settings-header',
        { y: -20, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.profile-card',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.profile-card',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.security-card',
        { x: 20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.security-card',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (user) {
      onUpdateUser({ ...user, ...formData });
    }
    
    toast.success('Profile updated!', {
      description: 'Your changes have been saved successfully.'
    });
    
    setHasChanges(false);
    setIsSaving(false);
  };

  const handleDiscard = () => {
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
      bio: user?.bio || '',
    });
    setHasChanges(false);
    toast.info('Changes discarded');
  };

  return (
    <div ref={sectionRef} className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="settings-header">
        <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Account Settings</h1>
        <p className="text-[#5A6B7A]">Manage your professional identity and security preferences within the Sanctuary.</p>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Information */}
        <div className="lg:col-span-2">
          <div className="profile-card bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-[#2B6CB0]" />
              </div>
              <h2 className="text-lg font-semibold text-[#1A202C]">Profile Information</h2>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium text-[#1A202C]">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-[#1A202C]">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio" className="text-sm font-medium text-[#1A202C]">
                  Bio
                </Label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="w-full h-24 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl p-3 text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0] resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="security-card">
          <div className="bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#FEF3F2] rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#E53E3E]" />
              </div>
              <h2 className="text-lg font-semibold text-[#1A202C]">Security</h2>
            </div>

            <p className="text-sm text-[#5A6B7A] mb-4">
              Last changed 3 months ago. We recommend updating your password semi-annually.
            </p>

            <Button
              variant="outline"
              onClick={() => toast.info('Password change feature coming soon!')}
              className="w-full h-12 rounded-xl border-[#D6E3F0] text-[#1A202C] hover:bg-[#F3F7FB]"
            >
              <Shield className="w-4 h-4 mr-2" />
              Change Password
            </Button>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] p-4 flex items-center gap-4 z-50">
          <div className="flex items-center gap-2 text-sm text-[#5A6B7A]">
            <Info className="w-4 h-4" />
            <span>Any changes made will be applied immediately to your clinical profile.</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              className="h-10 px-4 rounded-lg border-[#D6E3F0] text-[#5A6B7A]"
            >
              <X className="w-4 h-4 mr-2" />
              Discard Changes
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="h-10 px-6 bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-lg"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {/* Additional Settings */}
      <div className="bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
        <h2 className="text-lg font-semibold text-[#1A202C] mb-4">Notification Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-[#F3F7FB] rounded-xl">
            <div>
              <p className="font-medium text-[#1A202C]">Email Notifications</p>
              <p className="text-sm text-[#5A6B7A]">Receive updates about your pets via email</p>
            </div>
            <div className="w-12 h-6 bg-[#2B6CB0] rounded-full relative cursor-pointer">
              <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 transition-transform" />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-[#F3F7FB] rounded-xl">
            <div>
              <p className="font-medium text-[#1A202C]">Vaccination Reminders</p>
              <p className="text-sm text-[#5A6B7A]">Get notified when vaccinations are due</p>
            </div>
            <div className="w-12 h-6 bg-[#2B6CB0] rounded-full relative cursor-pointer">
              <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 transition-transform" />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-[#F3F7FB] rounded-xl">
            <div>
              <p className="font-medium text-[#1A202C]">Appointment Reminders</p>
              <p className="text-sm text-[#5A6B7A]">Receive reminders before scheduled appointments</p>
            </div>
            <div className="w-12 h-6 bg-[#2B6CB0] rounded-full relative cursor-pointer">
              <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
