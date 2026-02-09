"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Search, Mail, CheckCircle, XCircle, Clock, Eye, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { resendFailedEmails } from "@/app/actions/resend-failed-emails";

interface EmailLog {
  id: string;
  resend_id: string | null;
  template_key: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  body_html: string | null;
  status: string;
  recipient_type: string | null;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
  opened_at: string | null;
}

export default function SentEmailsPage() {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const pageSize = 20;

  useEffect(() => {
    loadEmails();
  }, [page, statusFilter]);

  async function loadEmails() {
    setLoading(true);
    const supabase = createClient();
    
    let query = supabase
      .from("email_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, count, error } = await query;

    if (!error && data) {
      setEmails(data);
      setTotal(count || 0);
    }
    setLoading(false);
  }

  const filteredEmails = emails.filter((email) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      email.to_email.toLowerCase().includes(searchLower) ||
      email.subject.toLowerCase().includes(searchLower) ||
      (email.template_key && email.template_key.toLowerCase().includes(searchLower))
    );
  });

  async function handleResendFailed() {
    if (!confirm("Resend all failed/bounced emails? This will attempt to send them again.")) {
      return;
    }

    setResending(true);
    setResendMessage("");

    try {
      const result = await resendFailedEmails();
      
      if (result.success) {
        setResendMessage(`Successfully resent ${result.resent} email(s). ${result.failed} failed.`);
        await loadEmails(); // Refresh the list
      } else {
        setResendMessage(`Error: ${result.error}`);
      }
    } catch (err) {
      setResendMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    setResending(false);
    
    // Clear message after 5 seconds
    setTimeout(() => setResendMessage(""), 5000);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "sent":
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />Sent</Badge>;
      case "delivered":
        return <Badge className="gap-1 bg-green-500"><CheckCircle className="w-3 h-3" />Delivered</Badge>;
      case "opened":
        return <Badge className="gap-1 bg-purple-500"><Eye className="w-3 h-3" />Opened</Badge>;
      case "bounced":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Bounced</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/emails">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Sent Emails</h1>
          <p className="text-muted-foreground">View all emails sent from the system</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Log ({total} total)
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                onClick={handleResendFailed}
                disabled={resending}
              >
                <Send className="w-4 h-4 mr-2" />
                {resending ? "Resending..." : "Resend Failed"}
              </Button>
              <Button variant="outline" size="icon" onClick={loadEmails}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {resendMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              resendMessage.includes("Error") 
                ? "bg-red-50 text-red-700 border border-red-200" 
                : "bg-green-50 text-green-700 border border-green-200"
            }`}>
              {resendMessage}
            </div>
          )}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No emails found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(email.created_at).toLocaleDateString()}{" "}
                          <span className="text-muted-foreground text-xs">
                            {new Date(email.created_at).toLocaleTimeString()}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{email.to_email}</TableCell>
                        <TableCell className="max-w-[250px] truncate font-medium">{email.subject}</TableCell>
                        <TableCell>
                          {email.template_key ? (
                            <Badge variant="outline">{email.template_key}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Custom</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(email.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(email)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {total > pageSize && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(page + 1) * pageSize >= total}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Email Detail Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">To</p>
                  <p className="font-medium">{selectedEmail.to_email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedEmail.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Sent</p>
                  <p>{new Date(selectedEmail.created_at).toLocaleString()}</p>
                </div>
                {selectedEmail.delivered_at && (
                  <div>
                    <p className="text-muted-foreground">Delivered</p>
                    <p>{new Date(selectedEmail.delivered_at).toLocaleString()}</p>
                  </div>
                )}
                {selectedEmail.opened_at && (
                  <div>
                    <p className="text-muted-foreground">Opened</p>
                    <p>{new Date(selectedEmail.opened_at).toLocaleString()}</p>
                  </div>
                )}
                {selectedEmail.error_message && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Error</p>
                    <p className="text-destructive">{selectedEmail.error_message}</p>
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-muted-foreground text-sm mb-1">Subject</p>
                <p className="font-semibold">{selectedEmail.subject}</p>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-2">Content</p>
                <div 
                  className="border rounded-lg p-4 bg-white"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.body_html || "" }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
