import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'vsg_session';
const PUBLIC_PATHS = ['/login', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectToLogin(request);

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? '');
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const response = redirectToLogin(request);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Lewati aset statis; semua route halaman lain wajib login.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
