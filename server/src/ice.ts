/**
 * ICE servers for WebRTC. STUN always; TURN only when all three env vars are
 * set (provider decided later: Cloudflare Calls TURN, Metered, Twilio NTS...).
 * Credentials live in server/.env or the host's env, never in the repo.
 */
export const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export function iceServersFromEnv(env: Record<string, string | undefined> = process.env): IceServer[] {
  const servers: IceServer[] = [{ urls: STUN_URLS }];
  const urls = (env.TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return servers;
}
