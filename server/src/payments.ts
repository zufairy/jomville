import { createHmac, timingSafeEqual } from 'node:crypto';
import { Repo } from './repo';

export const CREDIT_PACKS = {
  rm30: { id: 'rm30', name: 'Starter Top Up', credits: 500, amountSen: 3000 },
  rm50: { id: 'rm50', name: 'Lepak Stack', credits: 1000, amountSen: 5000 },
  rm100: { id: 'rm100', name: 'Legend Stack', credits: 2500, amountSen: 10000 },
} as const;

export type CreditPackId = keyof typeof CREDIT_PACKS;

export function creditPack(id: unknown) {
  return typeof id === 'string' && id in CREDIT_PACKS ? CREDIT_PACKS[id as CreditPackId] : null;
}

const stripeSecret = () => {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return key;
};

const webhookSecret = () => {
  const key = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!key) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return key;
};

async function stripeFetch<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${stripeSecret()}`,
      ...(init.headers ?? {}),
    },
  });
  const data = (await r.json().catch(() => null)) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(data?.error?.message ?? `Stripe HTTP ${r.status}`);
  return data;
}

const form = (entries: Record<string, string | number | undefined>) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) body.set(key, String(value));
  return body;
};

export interface StripeSession {
  id: string;
  url?: string | null;
  payment_status?: string;
  amount_total?: number;
  metadata?: Record<string, string>;
}

export async function createCreditCheckout(input: { userId: string; email?: string | null; packId: CreditPackId; origin: string }): Promise<StripeSession> {
  const pack = CREDIT_PACKS[input.packId];
  return stripeFetch<StripeSession>('/checkout/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({
      mode: 'payment',
      success_url: `${input.origin}/play?credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.origin}/play?credits=cancelled`,
      customer_email: input.email ?? undefined,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': 'myr',
      'line_items[0][price_data][unit_amount]': pack.amountSen,
      'line_items[0][price_data][product_data][name]': `Leypark ${pack.name}`,
      'line_items[0][price_data][product_data][description]': `${pack.credits.toLocaleString()} Leypark credits`,
      'metadata[purpose]': 'credit_pack',
      'metadata[user_id]': input.userId,
      'metadata[pack_id]': pack.id,
      'metadata[credits]': pack.credits,
      'metadata[amount_sen]': pack.amountSen,
    }),
  });
}

export async function retrieveCheckoutSession(sessionId: string): Promise<StripeSession> {
  if (!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error('bad session id');
  return stripeFetch<StripeSession>(`/checkout/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
}

export async function awardCreditsFromSession(repo: Repo, session: StripeSession): Promise<{ granted: boolean; coins: number } | null> {
  if (session.payment_status !== 'paid') return null;
  if (session.metadata?.purpose !== 'credit_pack') return null;
  const userId = session.metadata.user_id;
  const pack = creditPack(session.metadata.pack_id);
  if (!userId || !pack) return null;
  const amount = session.amount_total ?? Number(session.metadata.amount_sen ?? 0);
  if (amount !== pack.amountSen) throw new Error('stripe amount mismatch');
  return repo.recordCreditPurchase({
    sessionId: session.id,
    userId,
    packId: pack.id,
    credits: pack.credits,
    amountSen: pack.amountSen,
  });
}

export function verifyStripeEvent(rawBody: Buffer, signature: string | undefined): { type?: string; data?: { object?: StripeSession } } {
  if (!signature) throw new Error('missing stripe signature');
  const timestamp = signature.split(',').find((p) => p.startsWith('t='))?.slice(2);
  const expected = signature.split(',').find((p) => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !expected) throw new Error('bad stripe signature');
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const digest = createHmac('sha256', webhookSecret()).update(signedPayload).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('stripe signature verification failed');
  return JSON.parse(rawBody.toString('utf8')) as { type?: string; data?: { object?: StripeSession } };
}
