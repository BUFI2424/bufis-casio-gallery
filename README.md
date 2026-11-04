# Casio Gallery

Photos taken with a Casio camera watch (120×120 pixels, 16 greys), shown as a 2000s-style desktop.
By Gerard Bufí.

## How it is built

- `index.html` – the whole gallery (one page, no build step). Served by GitHub Pages.
- `js/backend.js` – connects the page to Firebase: anonymous sign-in for visitors, Google sign-in for the owner, and the Firestore database.
- `js/config.js` – the Firebase project settings and the owner's user id.
- `firestore.rules` – who may read and write what. Paste it into Firebase console → Firestore → Rules.
- `migration/` – one-off import of the photos and texts from the old Claude version. Can be deleted once imported.

Everything (photos, texts, the manual, edited pictures, share.exe posts) lives in Firestore as data URLs, so the project runs on Firebase's free Spark plan without Cloud Storage.

## Owner

- Open the site with `#login` at the end of the address to sign in with Google (or to sign out).
- Signed in as the owner you get the edit mode; everyone else sees the gallery.
