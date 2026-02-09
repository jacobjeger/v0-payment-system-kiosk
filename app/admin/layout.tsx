"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Users,
  Receipt,
  FileText,
  LogOut,
  Loader2,
  Wallet,
  AlertTriangle,
  UserCog,
  Mail,
  Menu,
  X,
  CreditCard,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { generateDeviceFingerprint } from "@/lib/device-fingerprint";

interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  access_level: "super_admin" | "admin" | "manager" | "viewer";
  is_active: boolean;
  mfa_enabled?: boolean;
  mfa_verified_at?: string;
}

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, levels: ["super_admin", "admin", "manager", "viewer"] },
  { href: "/admin/businesses", label: "Businesses", icon: Store, levels: ["super_admin", "admin", "manager"] },
  { href: "/admin/members", label: "Members", icon: Users, levels: ["super_admin", "admin", "manager"] },
  { href: "/admin/transactions", label: "Transactions", icon: Receipt, levels: ["super_admin", "admin", "manager", "viewer"] },
  { href: "/admin/billing/cycles", label: "Billing", icon: FileText, levels: ["super_admin", "admin"] },
  { href: "/admin/billing/declined", label: "Declined Cards", icon: CreditCard, levels: ["super_admin", "admin", "manager"] },
  { href: "/admin/payouts", label: "Payouts", icon: Wallet, levels: ["super_admin", "admin"] },
  { href: "/admin/reviews", label: "Reviews", icon: AlertTriangle, levels: ["super_admin", "admin", "manager"] },
  { href: "/admin/emails", label: "Emails", icon: Mail, levels: ["super_admin", "admin"] },
  { href: "/admin/admins", label: "Admins", icon: ShieldCheck, levels: ["super_admin"] },
  { href: "/admin/settings", label: "Settings", icon: Settings, levels: ["super_admin", "admin"] },
];

const accessLevelLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  viewer: "Viewer",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      
      // Check if user is in admin_users table
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("*")
        .eq("email", user.email?.toLowerCase())
        .single();
      
      if (!adminData || !adminData.is_active) {
        // Also check legacy admin role
        const userRole = user.user_metadata?.role;
        if (userRole !== "admin") {
          router.push("/member/dashboard");
          return;
        }
      }
      
      // Check if MFA is required and not verified
      if (adminData?.mfa_enabled) {
        // Generate device fingerprint
        const deviceFingerprint = generateDeviceFingerprint();
        console.log("[v0] Admin layout - checking device fingerprint:", deviceFingerprint);
        
        // Check if this device is trusted by querying the database directly
        const { data: trustedDevice, error: deviceError } = await supabase
          .from("trusted_devices")
          .select("id, device_fingerprint")
          .eq("admin_user_id", adminData.id)
          .eq("device_fingerprint", deviceFingerprint)
          .maybeSingle(); // Use maybeSingle to avoid error when no rows found
        
        console.log("[v0] Admin layout - trusted device result:", { trustedDevice, deviceError });
        
        // If device is not trusted, require MFA verification
        if (!trustedDevice) {
          console.log("[v0] Admin layout - device not trusted, redirecting to MFA");
          // Redirect to MFA verification page outside admin layout
          router.push(`/auth/mfa-verify?admin_id=${adminData.id}&email=${encodeURIComponent(user.email!)}&device=${encodeURIComponent(deviceFingerprint)}`);
          return;
        }
        
        console.log("[v0] Admin layout - device is trusted, allowing access");
      }
      
      setUser(user);
      setAdminUser(adminData);
      setLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        router.push("/auth/login");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
          <p className="text-stone-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Filter nav items based on access level
  const userLevel = adminUser?.access_level || "admin"; // Default to admin for legacy users
  const filteredNavItems = navItems.filter(item => item.levels.includes(userLevel));

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-stone-200 flex items-center justify-between px-4 z-50">
        <span className="font-bold text-lg text-stone-900">PDCA</span>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/20 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-full w-56 bg-white border-r border-stone-200 flex flex-col z-50 transition-transform duration-200
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand */}
        <div className="h-14 flex items-center px-5 border-b border-stone-200">
          <span className="font-bold text-lg text-stone-900">PDCA</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-1">
            {filteredNavItems.map((item) => {
              const isActive = item.href === "/admin" 
                ? pathname === "/admin" 
                : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-stone-400 group-hover:text-stone-600"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-stone-200">
          <div className="mx-1">
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-sm font-medium text-stone-600">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{user.email}</p>
                <p className="text-xs text-stone-500">{accessLevelLabels[userLevel]}</p>
              </div>
            </div>
          </div>

          <Link
            href="/admin/profile"
            onClick={() => setSidebarOpen(false)}
            className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-sm font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <User className="w-4 h-4" />
            Profile & Password
          </Link>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:ml-56 min-h-screen pt-14 lg:pt-0">
        <div className="p-4 lg:p-8 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
