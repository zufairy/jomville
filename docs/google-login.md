# Enable Google login for Leypark

Leypark already uses Google Identity Services. The browser sends a Google ID token to
`POST /api/auth/google`; the server verifies it and links the player's account. No
Firebase project, client secret, or redirect callback is required for this popup flow.

## 1. Create the Google web client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a Leypark project.
2. Open **Google Auth Platform**. Complete **Branding** with the app name, support email, developer contact, and your actual website. Supply real privacy/terms URLs if required by Google for your publication state; Leypark does not currently include these pages.
3. Choose an **External** audience for public players. While testing, add your own Google account under test users if Google requires it for your configuration. Complete Google's publishing requirements before public launch.
4. Under **Clients**, create an OAuth client with application type **Web application**.
5. Add these **Authorized JavaScript origins**:
   - `http://localhost`
   - `http://localhost:5173`
   - Your exact live origin, such as `https://YOUR-DOMAIN`.
   - Add the `www` origin separately if players also use it. Origins contain no path, query, or trailing slash.
6. Copy the **Client ID**, ending in `.apps.googleusercontent.com`.

## 2. Configure local development

Create `client/.env.local` (gitignored):

```dotenv
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

Add to `server/.env` (gitignored), preserving existing values:

```dotenv
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

Both values must be exactly the same. Run `pnpm dev` from the repository root and open
`http://localhost:5173`. Restart both processes after changing the variables.
The server reads its environment when constructing the API, after loading `.env`.

## 3. Configure Railway

In your service's **Variables**, set both `GOOGLE_CLIENT_ID` and
`VITE_GOOGLE_CLIENT_ID` to the same client ID. **Redeploy**, because Vite embeds its
variable at build time. Add the actual Railway/custom domain to Google's authorized
origins. Keep the existing persistent database volume attached to preserve accounts.

## 4. Verify

- Open the landing page and click **Log in**, which takes you to the join section.
- **Continue with Google** appears when the client ID was included in the build.
- Select your account, complete avatar onboarding, and enter the game.
- In a second browser/device, sign in with the same Google account and confirm the
  same profile is restored. An existing Google account takes precedence over that
  device's guest profile; this is account switching, not an inventory merge.
- Cancel the Google popup and confirm you can still explore as a guest.

If the button is missing, check `VITE_GOOGLE_CLIENT_ID` and rebuild/restart Vite.
If Google says the origin isn't allowed, compare scheme, hostname, and port exactly.
If the API reports sign-in is not configured, check the server variable and restart.
If it reports an invalid token, check that both client IDs match. Browser blockers
may prevent the Google script or popup from loading; the button offers a retry.

Never put a Google **client secret** into a `VITE_` variable. This implementation
only needs the public client ID. A real end-to-end sign-in requires your configured
Google project and an interactive Google account; automated checks use mocked tokens.

Reference: [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
