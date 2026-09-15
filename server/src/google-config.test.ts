import { afterEach, describe, expect, it, vi } from 'vitest';

const { oauthConstructor } = vi.hoisted(() => ({ oauthConstructor: vi.fn() }));
vi.mock('google-auth-library', () => ({ OAuth2Client: oauthConstructor }));

// Import before setting env: mirrors index.ts loading .env after static imports.
import { buildApi } from './api';
import type { Repo } from './repo';

afterEach(() => {
  vi.unstubAllEnvs();
  oauthConstructor.mockClear();
});

describe('Google configuration at server startup', () => {
  it('uses the client ID loaded after the API module was imported', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'local-client.apps.googleusercontent.com');
    buildApi({} as Repo);
    expect(oauthConstructor).toHaveBeenCalledWith('local-client.apps.googleusercontent.com');
  });
  it('leaves Google disabled when no client ID is configured', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    buildApi({} as Repo);
    expect(oauthConstructor).not.toHaveBeenCalled();
  });
});
