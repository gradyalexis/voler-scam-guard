import { NextResponse } from 'next/server';
import { authConfig, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.redirect(`${authConfig().baseUrl}/login`, { status: 303 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
