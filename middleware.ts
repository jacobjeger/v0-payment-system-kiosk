import { updateSession } from '@/lib/supabase/proxy'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const url = request.nextUrl.clone();
  
  // Check if request is from kiosk subdomain
  if (hostname.startsWith('kiosk.')) {
    // Rewrite to /kiosk path but keep the URL looking clean
    if (url.pathname === '/') {
      url.pathname = '/kiosk';
      return NextResponse.rewrite(url);
    }
    // Block access to other routes from kiosk subdomain
    if (!url.pathname.startsWith('/kiosk') && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/_next')) {
      url.pathname = '/kiosk';
      return NextResponse.rewrite(url);
    }
  }
  
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
