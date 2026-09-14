/**
 * Proximity voice: open-mic audio between people standing near each other.
 * Distances are in tiles (Euclidean). Links open a little before a voice is
 * audible and close a little after it fades, so walking along the edge does
 * not flap the peer connection.
 */
export const VOICE_FULL = 2;
export const VOICE_RADIUS = 7;
export const VOICE_CONNECT = VOICE_RADIUS + 1;
export const VOICE_DISCONNECT = VOICE_RADIUS + 3;
/** signaling messages per session per window (SDP + trickled ICE bursts) */
export const VOICE_RTC_RATE = { count: 150, windowMs: 5000 };

export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Loudness for a speaker `d` tiles away: 1 up close, easing to 0 at the radius. */
export function voiceGain(d: number): number {
  if (!(d >= 0)) return 0;
  if (d <= VOICE_FULL) return 1;
  if (d >= VOICE_RADIUS) return 0;
  const t = (d - VOICE_FULL) / (VOICE_RADIUS - VOICE_FULL);
  return (1 - t) * (1 - t);
}

/**
 * Whether a pair should hold a voice link. Symmetric in its inputs so both
 * sides agree; `linked` widens the range for hysteresis.
 */
export function wantsVoiceLink(d: number, eitherMicOn: boolean, linked: boolean): boolean {
  return eitherMicOn && d <= (linked ? VOICE_DISCONNECT : VOICE_CONNECT);
}

/** Exactly one side of a pair sends the offer. */
export function voiceInitiator(me: string, peer: string): boolean {
  return me < peer;
}
