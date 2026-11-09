import { z } from "zod";

/**
 * Signed session cookie for public demo schools (no Supabase Auth account).
 * Web Crypto only, so middleware (Edge) and route handlers (Node) share it.
 * Format: base64url(JSON payload) "." base64url(HMAC-SHA256(secret, payload part)).
 */
export const DEMO_COOKIE = "ss_demo";

/** The browser keeps the cookie this long past `exp` so the app can show "demo ended". */
const COOKIE_GRACE_SECONDS = 7 * 24 * 60 * 60;
const MIN_SECRET_BYTES = 32;

const PayloadSchema = z.object({
  staffId: z.string().uuid(),
  schoolId: z.string().uuid(),
  exp: z.number().int().positive(),
});
export type DemoSession = z.infer<typeof PayloadSchema>;

export type DemoSessionCheck =
  | { status: "valid"; session: DemoSession }
  | { status: "expired"; session: DemoSession }
  | { status: "invalid" };

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The configured secret, or null when unset or too short (demo features then fail closed). */
export function demoSecret(): string | null {
  const secret = process.env.DEMO_SESSION_SECRET;
  return secret && encoder.encode(secret).length >= MIN_SECRET_BYTES ? secret : null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Hex HMAC-SHA256 of `message` under the demo secret (used to hash client IPs). */
export async function demoHmacHex(secret: string, message: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signDemoSession(session: DemoSession, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(PayloadSchema.parse(session))));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

function parsePayload(bytes: Uint8Array): DemoSession | null {
  try {
    const parsed = PayloadSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Verifies the signature (constant time via `crypto.subtle.verify`), then the expiry. */
export async function verifyDemoSession(
  token: string | undefined,
  secret: string | null,
  now: number = Date.now(),
): Promise<DemoSessionCheck> {
  if (!token || !secret) return { status: "invalid" };
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra !== undefined) return { status: "invalid" };
  const signature = fromBase64Url(signaturePart);
  const payloadBytes = fromBase64Url(payloadPart);
  if (!signature || !payloadBytes) return { status: "invalid" };
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    encoder.encode(payloadPart),
  );
  const session = ok ? parsePayload(payloadBytes) : null;
  if (!session) return { status: "invalid" };
  return session.exp > now ? { status: "valid", session } : { status: "expired", session };
}

export interface DemoCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function demoCookieOptions(exp: number, now: number = Date.now()): DemoCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, Math.ceil((exp - now) / 1000)) + COOKIE_GRACE_SECONDS,
  };
}
