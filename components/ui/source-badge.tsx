"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Monitor, Smartphone, Tablet, Globe, ShieldCheck, Store, FlaskConical, HelpCircle } from "lucide-react";

interface SourceBadgeProps {
  source?: string;
  deviceInfo?: Record<string, unknown> | null;
}

export function SourceBadge({ source, deviceInfo }: SourceBadgeProps) {
  const getSourceConfig = (src?: string) => {
    switch (src) {
      case 'kiosk':
        return { label: 'Kiosk', icon: Monitor, className: 'bg-blue-100 text-blue-700' };
      case 'business_portal':
        return { label: 'Business', icon: Store, className: 'bg-purple-100 text-purple-700' };
      case 'admin_panel':
        return { label: 'Admin', icon: ShieldCheck, className: 'bg-amber-100 text-amber-700' };
      case 'api':
        return { label: 'API', icon: Globe, className: 'bg-green-100 text-green-700' };
      case 'test_data':
        return { label: 'Test', icon: FlaskConical, className: 'bg-gray-100 text-gray-700' };
      default:
        return { label: 'Unknown', icon: HelpCircle, className: 'bg-gray-100 text-gray-500' };
    }
  };

  const getDeviceType = (info?: Record<string, unknown> | null) => {
    if (!info?.userAgent) return null;
    const ua = String(info.userAgent).toLowerCase();
    if (ua.includes('ipad') || ua.includes('tablet')) return { type: 'Tablet', icon: Tablet };
    if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) return { type: 'Mobile', icon: Smartphone };
    return { type: 'Desktop', icon: Monitor };
  };

  const config = getSourceConfig(source);
  const deviceType = getDeviceType(deviceInfo);
  const Icon = config.icon;

  const tooltipContent = deviceInfo ? (
    <div className="text-xs space-y-1">
      {deviceType && <p><span className="font-medium">Device:</span> {deviceType.type}</p>}
      {deviceInfo.platform && <p><span className="font-medium">Platform:</span> {String(deviceInfo.platform)}</p>}
      {deviceInfo.screenWidth && deviceInfo.screenHeight && (
        <p><span className="font-medium">Screen:</span> {String(deviceInfo.screenWidth)}x{String(deviceInfo.screenHeight)}</p>
      )}
      {deviceInfo.timezone && <p><span className="font-medium">Timezone:</span> {String(deviceInfo.timezone)}</p>}
    </div>
  ) : null;

  const badge = (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );

  if (!tooltipContent) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
