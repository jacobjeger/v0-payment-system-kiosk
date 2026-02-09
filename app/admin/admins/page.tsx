"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Shield, ShieldCheck, ShieldAlert, Eye, Loader2, Trash2, KeyRound } from "lucide-react";
import { getAdminUsers, addAdminUser, updateAdminUser, removeAdminUser, getCurrentAdminUser, regenerateAdminPassword } from "@/app/actions/admin";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: string;
  auth_user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  access_level: "super_admin" | "admin" | "manager" | "viewer";
  is_active: boolean;
  created_at: string;
}

const accessLevelInfo = {
  super_admin: {
    label: "Super Admin",
    description: "Full access to all features including admin management",
    icon: ShieldAlert,
    color: "bg-red-100 text-red-800",
  },
  admin: {
    label: "Admin",
    description: "Full access to all features except admin management",
    icon: ShieldCheck,
    color: "bg-blue-100 text-blue-800",
  },
  manager: {
    label: "Manager",
    description: "Can manage members, businesses, and view transactions",
    icon: Shield,
    color: "bg-green-100 text-green-800",
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to view data",
    icon: Eye,
    color: "bg-gray-100 text-gray-800",
  },
};

export default function AdminManagementPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const { toast } = useToast();
  const [newAdmin, setNewAdmin] = useState({
    email: "",
    firstName: "",
    lastName: "",
    accessLevel: "viewer" as AdminUser["access_level"],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [adminsResult, currentResult] = await Promise.all([
      getAdminUsers(),
      getCurrentAdminUser(),
    ]);
    if (adminsResult.success) setAdmins(adminsResult.data || []);
    if (currentResult.success) setCurrentAdmin(currentResult.data);
    setLoading(false);
  }

  async function handleAddAdmin() {
    if (!newAdmin.email) return;
    setSaving(true);
    
    const result = await addAdminUser({
      email: newAdmin.email,
      firstName: newAdmin.firstName,
      lastName: newAdmin.lastName,
      accessLevel: newAdmin.accessLevel,
    });

    if (result.success) {
      setDialogOpen(false);
      setNewAdmin({ email: "", firstName: "", lastName: "", accessLevel: "viewer" });
      loadData();
    }
    setSaving(false);
  }

  async function handleUpdateAccess(adminId: string, accessLevel: AdminUser["access_level"]) {
    await updateAdminUser(adminId, { accessLevel });
    loadData();
  }

  async function handleToggleActive(adminId: string, isActive: boolean) {
    await updateAdminUser(adminId, { isActive });
    loadData();
  }

  async function handleRemoveAdmin(adminId: string) {
    if (!confirm("Are you sure you want to remove this admin?")) return;
    await removeAdminUser(adminId);
    loadData();
  }

  async function handleResetPassword(adminId: string, adminEmail: string) {
    if (!confirm(`This will generate a new temporary password and send it to ${adminEmail}. Continue?`)) return;
    setResettingPassword(adminId);
    const result = await regenerateAdminPassword(adminId);
    if (result.success) {
      toast({
        title: "Password Reset",
        description: `A new temporary password has been sent to ${adminEmail}`,
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to reset password",
        variant: "destructive",
      });
    }
    setResettingPassword(null);
  }

  const isSuperAdmin = currentAdmin?.access_level === "super_admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              Only Super Admins can manage admin users.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter admins by search
  const filteredAdmins = admins.filter((admin) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const name = `${admin.first_name || ""} ${admin.last_name || ""}`.toLowerCase();
    return name.includes(query) || admin.email.toLowerCase().includes(query);
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage admin users and their access levels
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search admins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
          />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Admin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Admin</DialogTitle>
                <DialogDescription>
                  Create a new admin user with specific access permissions
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      value={newAdmin.firstName}
                      onChange={(e) => setNewAdmin({ ...newAdmin, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={newAdmin.lastName}
                      onChange={(e) => setNewAdmin({ ...newAdmin, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Access Level</Label>
                  <Select
                    value={newAdmin.accessLevel}
                    onValueChange={(value) => setNewAdmin({ ...newAdmin, accessLevel: value as AdminUser["access_level"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(accessLevelInfo).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <info.icon className="w-4 h-4" />
                            {info.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {accessLevelInfo[newAdmin.accessLevel].description}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddAdmin} disabled={saving || !newAdmin.email}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Add Admin
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Access Level Legend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Access Levels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(accessLevelInfo).map(([key, info]) => (
              <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <info.icon className="w-5 h-5 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{info.label}</p>
                  <p className="text-xs text-muted-foreground">{info.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Admin List */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Users</CardTitle>
          <CardDescription>
            {filteredAdmins.length} of {admins.length} admin user{admins.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAdmins.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No admins match your search" : "No admin users yet. Add your first admin above."}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredAdmins.map((admin) => {
                const levelInfo = accessLevelInfo[admin.access_level];
                const isCurrentUser = admin.id === currentAdmin?.id;
                
                return (
                  <div
                    key={admin.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      !admin.is_active ? "bg-muted/50 opacity-60" : "bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${levelInfo.color}`}>
                        <levelInfo.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {admin.first_name && admin.last_name
                              ? `${admin.first_name} ${admin.last_name}`
                              : admin.email}
                          </p>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                          {!admin.is_active && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{admin.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <Select
                        value={admin.access_level}
                        onValueChange={(value) => handleUpdateAccess(admin.id, value as AdminUser["access_level"])}
                        disabled={isCurrentUser}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(accessLevelInfo).map(([key, info]) => (
                            <SelectItem key={key} value={key}>
                              {info.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={admin.is_active}
                          onCheckedChange={(checked) => handleToggleActive(admin.id, checked)}
                          disabled={isCurrentUser}
                        />
                        <span className="text-xs text-muted-foreground w-12">
                          {admin.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      
                      {!isCurrentUser && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleResetPassword(admin.id, admin.email)}
                            disabled={resettingPassword === admin.id}
                            title="Reset Password"
                          >
                            {resettingPassword === admin.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <KeyRound className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveAdmin(admin.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
