"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Mail, Edit, Eye, Save, X, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  subject: string;
  body_text: string;
  description: string;
  variables: string[];
  is_active: boolean;
}

export default function AdminEmailsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const supabase = createClient();
    const { data } = await supabase
      .from("email_templates")
      .select("*")
      .order("name");
    
    // Map body_html to body_text for the interface, stripping HTML tags
    const mapped = (data || []).map(t => ({
      ...t,
      body_text: t.body_text || stripHtml(t.body_html || "")
    }));
    
    setTemplates(mapped);
    setLoading(false);
  }

  function stripHtml(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function textToHtml(text: string): string {
    // Convert plain text to simple HTML for email sending
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    
    const paragraphs = escaped.split(/\n\n+/);
    const html = paragraphs
      .map(p => `<p style="margin: 0 0 16px 0; line-height: 1.5;">${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
    
    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">${html}</div>`;
  }

  async function handleSaveTemplate() {
    if (!editingTemplate) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("email_templates")
      .update({
        subject: editingTemplate.subject,
        body_text: editingTemplate.body_text,
        body_html: textToHtml(editingTemplate.body_text),
        is_active: editingTemplate.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingTemplate.id);

    if (!error) {
      await loadTemplates();
      setEditingTemplate(null);
    } else {
      alert("Error saving template: " + error.message);
    }
    setSaving(false);
  }

  async function toggleTemplateActive(template: EmailTemplate) {
    const supabase = createClient();
    await supabase
      .from("email_templates")
      .update({ is_active: !template.is_active })
      .eq("id", template.id);
    
    await loadTemplates();
  }

  function getPreviewText(template: EmailTemplate) {
    let text = template.body_text;
    const sampleData: Record<string, string> = {
      name: "John Doe",
      email: "john@example.com",
      reset_link: "https://example.com/reset",
      login_link: "https://example.com/login",
      temp_password: "ABC12345",
      billing_period: "January 2026",
      total_amount: "150.00",
      currency: "₪",
      custom_message: "Thank you for your business!",
    };
    
    for (const [key, value] of Object.entries(sampleData)) {
      text = text.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    return text;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email Templates</h1>
        <p className="text-muted-foreground">Customize the emails sent to members and businesses</p>
      </div>

      <Link href="/admin/emails/sent">
        <Card className="hover:border-primary/50 transition-colors cursor-pointer max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Send className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Sent Emails</h3>
                <p className="text-sm text-muted-foreground">View email delivery log</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id} className={!template.is_active ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={template.is_active}
                    onCheckedChange={() => toggleTemplateActive(template)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <p className="font-medium">{template.subject}</p>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  <Label className="text-xs text-muted-foreground w-full">Variables:</Label>
                  {template.variables.map((v) => (
                    <code key={v} className="text-xs bg-muted px-2 py-1 rounded">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewTemplate(template)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingTemplate(template)}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit: {editingTemplate?.name}</DialogTitle>
          </DialogHeader>
          
          {editingTemplate && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  placeholder="Email subject..."
                />
              </div>

              <div className="space-y-2">
                <Label>Email Message</Label>
                <Textarea
                  value={editingTemplate.body_text}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body_text: e.target.value })}
                  rows={10}
                  placeholder="Write your email message here..."
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{variable}}"} to insert dynamic content. Click a variable below to copy it.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Label className="w-full text-sm text-muted-foreground">Available Variables:</Label>
                {editingTemplate.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="text-xs bg-stone-100 text-stone-700 px-2 py-1 rounded hover:bg-stone-200 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(`{{${v}}}`);
                    }}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Switch
                  id="active"
                  checked={editingTemplate.is_active}
                  onCheckedChange={(checked) => setEditingTemplate({ ...editingTemplate, is_active: checked })}
                />
                <Label htmlFor="active">Template Active</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          
          {previewTemplate && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <Label className="text-xs text-muted-foreground">Subject:</Label>
                <p className="font-medium">{previewTemplate.subject.replace(/{{[^}]+}}/g, (m) => {
                  const key = m.slice(2, -2);
                  const samples: Record<string, string> = { 
                    billing_period: "January 2026",
                    name: "John Doe"
                  };
                  return samples[key] || m;
                })}</p>
              </div>
              
              <div className="border rounded-lg p-4 bg-white">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {getPreviewText(previewTemplate)}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
            <Button onClick={() => {
              setEditingTemplate(previewTemplate);
              setPreviewTemplate(null);
            }}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
