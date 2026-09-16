export interface VideoPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  destroy(): void;
}
interface PlayerOptions {
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady(): void;
    onStateChange(event: { data: number }): void;
    onError(event: { data: number }): void;
    onAutoplayBlocked(): void;
  };
}
interface YouTubeAPI { Player: new (host: HTMLElement, options: PlayerOptions) => VideoPlayer }
declare global {
  interface Window { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void }
}
let loading: Promise<YouTubeAPI> | undefined;
export function loadYouTube(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => { loading = undefined; reject(new Error('YouTube took too long to connect. Reopen the jukebox to retry.')); }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { window.clearTimeout(timer); loading = undefined; script.remove(); reject(new Error('Cannot connect to YouTube. Check your connection and reopen the jukebox.')); };
    document.head.appendChild(script);
  });
  return loading;
}
