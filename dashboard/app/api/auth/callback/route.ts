import { NextResponse, type NextRequest } from 'next/server';
import {
  authConfig,
  createSessionToken,
  exchangeCode,
  fetchDiscordUser,
  resolveAdmin,
  SESSION_COOKIE,
  STATE_COOKIE,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

function loginError(base: string, code: string) {
  return NextResponse.redirect(`${base}/login?error=${code}`);
}

export async function GET(request: NextRequest) {
  const base = authConfig().baseUrl;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (url.searchParams.get('error')) return loginError(base, 'denied');
  if (!code || !state) return loginError(base, 'invalid_request');
  // Proteksi CSRF: state harus sama dengan yang dikirim saat memulai OAuth.
  if (!expectedState || expectedState !== state) return loginError(base, 'bad_state');

  try {
    const accessToken = await exchangeCode(code);
    const discordUser = await fetchDiscordUser(accessToken);
    const session = await resolveAdmin(discordUser);

    if (!session) return loginError(base, 'not_admin');

    const token = await createSessionToken(session);
    const response = NextResponse.redirect(`${base}/`);
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error('[auth] callback gagal', err);
    return loginError(base, 'server_error');
  }
}
