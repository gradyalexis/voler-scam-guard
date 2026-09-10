import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify, SignJWT } from 'jose';
import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { adminUsers } from './db/schema';

export const SESSION_COOKIE = 'vsg_session';
export const STATE_COOKIE = 'vsg_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

export type Role = 'owner' | 'admin' | 'moderator';

const ROLE_RANK: Record<Role, number> = { moderator: 1, admin: 2, owner: 3 };

export interface Session {
  discordId: string;
  username: string;
  avatar: string | null;
  role: Role;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diset`);
  return value;
}

export function authConfig() {
  return {
    clientId: requiredEnv('DISCORD_CLIENT_ID'),
    clientSecret: requiredEnv('DISCORD_CLIENT_SECRET'),
    baseUrl: requiredEnv('DASHBOARD_URL').replace(/\/$/, ''),
    secret: requiredEnv('AUTH_SECRET'),
  };
}

export function secretKey(): Uint8Array {
  return new TextEncoder().encode(requiredEnv('AUTH_SECRET'));
}

export function redirectUri(): string {
  return `${authConfig().baseUrl}/api/auth/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: authConfig().clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none',
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const { clientId, clientSecret } = authConfig();
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Token exchange gagal: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Response Discord tidak berisi access_token');
  return json.access_token;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Gagal mengambil profil Discord: HTTP ${res.status}`);
  return (await res.json()) as DiscordUser;
}

function bootstrapIds(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Cocokkan user Discord ke tabel admin_users. ID yang ada di
 * BOOTSTRAP_ADMIN_DISCORD_IDS otomatis dibuatkan baris `owner` — ini satu-satunya
 * cara masuk saat database masih kosong.
 */
export async function resolveAdmin(user: DiscordUser): Promise<Session | null> {
  const displayName = user.global_name || user.username;
  const isBootstrap = bootstrapIds().includes(user.id);

  if (isBootstrap) {
    await db
      .insert(adminUsers)
      .values({
        discordId: user.id,
        username: displayName,
        avatar: user.avatar,
        role: 'owner',
        lastLogin: new Date(),
      })
      .onConflictDoUpdate({
        target: adminUsers.discordId,
        set: { username: displayName, avatar: user.avatar, role: 'owner', lastLogin: new Date() },
      });
  }

  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.discordId, user.id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (!isBootstrap) {
    await db
      .update(adminUsers)
      .set({ username: displayName, avatar: user.avatar, lastLogin: new Date() })
      .where(eq(adminUsers.discordId, user.id));
  }

  return {
    discordId: row.discordId,
    username: displayName,
    avatar: user.avatar,
    role: (row.role as Role) ?? 'moderator',
  };
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.discordId !== 'string') return null;
    return {
      discordId: payload.discordId,
      username: String(payload.username ?? 'unknown'),
      avatar: (payload.avatar as string | null) ?? null,
      role: (payload.role as Role) ?? 'moderator',
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Dipakai di page/server action: paksa login sebelum melanjutkan. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export function hasRole(session: Session, minimum: Role): boolean {
  return ROLE_RANK[session.role] >= ROLE_RANK[minimum];
}

export async function requireRole(minimum: Role): Promise<Session> {
  const session = await requireSession();
  if (!hasRole(session, minimum)) {
    throw new Error(`Butuh role ${minimum} atau lebih tinggi untuk aksi ini.`);
  }
  return session;
}

export function avatarUrl(session: Session): string {
  if (!session.avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(session.discordId) >> 22n) % 6}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${session.discordId}/${session.avatar}.png?size=64`;
}

/** Jumlah admin terdaftar — dipakai halaman login untuk pesan bantuan. */
export async function adminCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers);
  return result[0]?.count ?? 0;
}
