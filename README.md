<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4d3c7ddb-f29b-42b6-83bb-486659b6dfc6

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Google sign-in in AI Studio

Firebase is retained for Google Authentication. If sign-in reports
`auth/unauthorized-domain`, the preview hostname must be added to the Firebase
project's authorized domains. This setting cannot be fixed by changing JSON data
or bypassed by switching from popup to redirect.

1. Click Google sign-in in the preview. The error panel shows the actual preview
   hostname (which can differ from the AI Studio editor's address).
2. Open [Firebase Authentication settings](https://console.firebase.google.com/project/gen-lang-client-0443495057/authentication/settings).
3. Under **Authorized domains**, add that exact hostname, without a protocol,
   port, or path. Retry sign-in. Repeat if the preview hostname changes.
4. Ensure **Google** is enabled under **Sign-in method**. For local development,
   authorize `localhost` as well.

Keep `authDomain` in `firebase-applet-config.json` pointed at the Firebase auth
handler; replacing it with the AI Studio preview hostname does not authorize it.

## Local data and JSON exports

The app initializes its browser database from `src/data/users.json`,
`src/data/dossiers.json`, and `src/data/campaigns.json`. Changes persist in
`localStorage` on that browser and origin; the browser does not rewrite source
files. No Firestore database is used. Firebase still manages sign-in identities.

Use **Exporter users.json** in user management and **Exporter dossiers.json** /
**Exporter campaigns.json** in campaign management to download updated data.
Replace the corresponding files in `src/data/` before pushing them to AI Studio.
Existing browser data takes precedence over seed files. A different preview
origin or browser starts from the bundled JSON files, so export changes before
moving previews or clearing browser storage.

The template directory includes Adam Nassir (`adam.nassir@logiclever.com`),
Guillaume Best (`guillaume.best@logiclever.com`), and Guillaume's additional
account (`guillaumebestece@gmail.com`), each with `ADMIN`, `JURY`, and `CANDIDATE`
roles.
