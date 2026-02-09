"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, AlertTriangle, Info, Shield, History, Calculator, Search } from "lucide-react";
import { getSystemSetting, updateSystemSetting, getAuditLogs, recalculateMemberBalance } from "@/app/actions/admin";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DeclinedCardMessage {
  title: string;
  subtitle: string;
  body: string;
  note: string;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  
  const [declinedMessage, setDeclinedMessage] = useState<DeclinedCardMessage>({
    title: "Card Payment Issue",
    subtitle: "Action required for your account",
    body: "Hi {{name}}, we were unable to process your recent payment. Your card was declined. Please choose how you would like to resolve this:",
    note: "If this issue is not resolved, your account may be restricted from making purchases."
  });
  
  const [pinRequired, setPinRequired] = useState(true);

  // Audit & Recovery state
  const [auditLogs, setAuditLogs] = useState<unknown[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState<string>("all");
  const [recalcMemberId, setRecalcMemberId] = useState("");
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcResult, setRecalcResult] = useState<{
    success: boolean;
    oldBalance?: number;
    newBalance?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    
    const [declinedResult, pinResult] = await Promise.all([
      getSystemSetting("declined_card_message"),
      getSystemSetting("pin_required"),
    ]);
    
    if (declinedResult.success && declinedResult.value) {
      setDeclinedMessage(declinedResult.value as DeclinedCardMessage);
    }
    if (pinResult.success && pinResult.value !== undefined) {
      setPinRequired(pinResult.value as boolean);
    }
    setLoading(false);
  }

  async function loadAuditLogs(tableName?: string) {
    setAuditLoading(true);
    const result = await getAuditLogs(
      tableName === "all" ? undefined : tableName,
      undefined,
      50
    );
    if (result.success && result.data) {
      setAuditLogs(result.data);
    }
    setAuditLoading(false);
  }

  async function handleRecalculateBalance() {
    if (!recalcMemberId.trim()) return;
    setRecalcLoading(true);
    setRecalcResult(null);
    const result = await recalculateMemberBalance(recalcMemberId.trim());
    setRecalcResult(result);
    setRecalcLoading(false);
    if (result.success) {
      loadAuditLogs(auditFilter);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage({ type: "", text: "" });
    
    const [declinedResult, pinResult] = await Promise.all([
      updateSystemSetting("declined_card_message", declinedMessage),
      updateSystemSetting("pin_required", pinRequired),
    ]);
    
    if (declinedResult.success && pinResult.success) {
      setMessage({ type: "success", text: "Settings saved successfully" });
    } else {
      setMessage({ type: "error", text: declinedResult.error || pinResult.error || "Failed to save settings" });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">System Settings</h1>
        <p className="text-muted-foreground mt-1">Configure global kiosk and messaging settings</p>
      </div>

      {message.text && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* PIN Security Settings */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            PIN Security
          </CardTitle>
          <CardDescription>
            Control whether members need to enter a PIN to make purchases at the kiosk
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Require PIN for all purchases</p>
              <p className="text-sm text-muted-foreground mt-1">
                {pinRequired 
                  ? "Members must enter their PIN to complete a transaction" 
                  : "Members can make purchases without entering a PIN"}
              </p>
            </div>
            <Switch
              checked={pinRequired}
              onCheckedChange={setPinRequired}
            />
          </div>
          {!pinRequired && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                Disabling PIN verification reduces security. Anyone with a member code can make purchases.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Declined Card Kiosk Message */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Declined Card - Kiosk Message
          </CardTitle>
          <CardDescription>
            Customize the message shown on the kiosk when a member has a declined card
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-stone-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-stone-600">
              Use <code className="bg-stone-200 px-1 rounded">{"{{name}}"}</code> to insert the member&apos;s first name
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={declinedMessage.title}
              onChange={(e) => setDeclinedMessage({ ...declinedMessage, title: e.target.value })}
              placeholder="Card Payment Issue"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              value={declinedMessage.subtitle}
              onChange={(e) => setDeclinedMessage({ ...declinedMessage, subtitle: e.target.value })}
              placeholder="Action required for your account"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Body Message</Label>
            <Textarea
              id="body"
              value={declinedMessage.body}
              onChange={(e) => setDeclinedMessage({ ...declinedMessage, body: e.target.value })}
              placeholder="Hi {{name}}, we were unable to process..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Warning Note</Label>
            <Textarea
              id="note"
              value={declinedMessage.note}
              onChange={(e) => setDeclinedMessage({ ...declinedMessage, note: e.target.value })}
              placeholder="If this issue is not resolved..."
              rows={2}
            />
          </div>

          {/* Preview */}
          <div className="mt-6 pt-6 border-t">
            <Label className="mb-3 block">Preview</Label>
            <div className="bg-white border-2 border-stone-200 rounded-xl p-6 max-w-sm mx-auto">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-center text-stone-900 mb-1">
                {declinedMessage.title || "Card Payment Issue"}
              </h3>
              <p className="text-sm text-stone-500 text-center mb-4">
                {declinedMessage.subtitle || "Action required"}
              </p>
              <p className="text-sm text-stone-600 text-center mb-4">
                {(declinedMessage.body || "").replace("{{name}}", "John")}
              </p>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3 text-center">
                {declinedMessage.note || "Warning note"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end mb-12">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Recovery Tools */}
      <div className="border-t pt-8 mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Recovery Tools</h2>
        <p className="text-muted-foreground mb-6">
          Tools for fixing data issues and recovering from errors
        </p>
      </div>

      {/* Recalculate Balance */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-500" />
            Recalculate Member Balance
          </CardTitle>
          <CardDescription>
            Fix balance discrepancies by recalculating from transaction history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="member-id">Member ID (UUID)</Label>
              <Input
                id="member-id"
                value={recalcMemberId}
                onChange={(e) => setRecalcMemberId(e.target.value)}
                placeholder="Enter member UUID..."
                className="font-mono text-sm"
              />
            </div>
            <Button
              onClick={handleRecalculateBalance}
              disabled={recalcLoading || !recalcMemberId.trim()}
            >
              {recalcLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Calculator className="w-4 h-4 mr-2" />
              )}
              Recalculate
            </Button>
          </div>
          {recalcResult && (
            <div
              className={`mt-4 p-4 rounded-lg ${
                recalcResult.success
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              {recalcResult.success ? (
                <div className="text-emerald-700">
                  <p className="font-medium">Balance recalculated successfully</p>
                  <p className="text-sm mt-1">
                    Old balance: ₪{recalcResult.oldBalance?.toFixed(2)} | New
                    balance: ₪{recalcResult.newBalance?.toFixed(2)}
                  </p>
                </div>
              ) : (
                <p className="text-red-700">{recalcResult.error}</p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Tip: To void a specific transaction, go to Transactions page and use
            the action menu on each row.
          </p>
        </CardContent>
      </Card>
      
      {/* Audit Logs */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-purple-500" />
            Audit Logs
          </CardTitle>
          <CardDescription>
            View history of admin actions and data changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <Select
              value={auditFilter}
              onValueChange={(v) => {
                setAuditFilter(v);
                loadAuditLogs(v);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                <SelectItem value="transactions">Transactions</SelectItem>
                <SelectItem value="members">Members</SelectItem>
                <SelectItem value="businesses">Businesses</SelectItem>
                <SelectItem value="balance_adjustments">
                  Balance Adjustments
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => loadAuditLogs(auditFilter)}
              disabled={auditLoading}
            >
              {auditLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Load Logs
            </Button>
          </div>

          {auditLogs.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Record ID</TableHead>
                    <TableHead>Changes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log: Record<string, unknown>) => (
                    <TableRow key={log.id as string}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.changed_at as string).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.table_name as string}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            log.action === "INSERT"
                              ? "bg-emerald-100 text-emerald-700"
                              : log.action === "UPDATE"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {log.action as string}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[120px]">
                        {(log.record_id as string)?.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.new_data
                          ? JSON.stringify(log.new_data).slice(0, 50) + "..."
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {auditLoading
                ? "Loading..."
                : 'Click "Load Logs" to view audit history'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
