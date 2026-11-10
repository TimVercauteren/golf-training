# Golf Training

A small offline-first web app (PWA) for logging golf practice on your phone.

- **Log a session**: date, where, how long (preset, typed, or the built-in timer), the areas you worked on, how it felt, and notes.
- **Score drills shot by shot**: tap **Make** or **Miss** after each attempt and the scorecard boxes fill in. You can also just type a count, like 7 of 10.
- **Today**: this week's practice shown as a scorecard against your weekly minutes goal, your drills with their latest score and trend, and recent sessions.
- **Progress**: drill success rate per session with a 5-session average, practice minutes per week or month, and where your time went by area.
- **Setup**: weekly goal, your drill list (add, edit, archive), light or dark theme, install help, and backup export and import.

There's no build step and no dependencies: just HTML, CSS and JavaScript.

## Files

| File | What it is |
|---|---|
| `index.html` | App shell and bottom tab bar |
| `styles.css` | All styling, light and dark |
| `app.js` | Everything else: storage, screens, charts |
| `sw.js` | Service worker, caches the app so it works offline |
| `manifest.webmanifest` | Name, icons and colors used when installed |
| `icons/` | App icons (SVG source plus PNG sizes) |

## Try it on your computer

Service workers need a real web server (not a double-clicked file). From this folder:

```
python -m http.server 8080
```

Then open http://localhost:8080.

## Put it on your phone

A PWA has to be served over **HTTPS** before a phone will install it. Two free options:

**Netlify Drop (quickest, no account setup beyond sign-in)**
1. Go to https://app.netlify.com/drop.
2. Drag this whole `GolfTraining` folder onto the page.
3. Open the URL it gives you on your phone.

**GitHub Pages (best if you'll keep changing it)**
1. Create a repository on GitHub and push this folder to it.
2. In the repository, go to Settings → Pages, pick the `main` branch and `/ (root)`.
3. Open `https://<your-username>.github.io/<repo-name>/` on your phone.

Then install it:
- **iPhone**: open the URL in Safari → Share → Add to Home Screen.
- **Android**: open it in Chrome → menu (three dots) → Install app.

## Your data

Everything is stored in the browser on your phone (localStorage), nothing is sent anywhere. That also means:

- Deleting the app, or clearing the browser's website data, deletes your log.
- Use **Setup → Export backup** every so often. On a phone it opens the share sheet so you can save the file to Files, Drive or email it to yourself. **Import backup** restores it, on the same phone or a new one.
- The app asks the browser to keep its storage persistent after your first saved session.

Backup files are plain JSON: `{ app, format, exportedAt, data: { settings, drills, sessions } }`.

## Changing the app

1. Edit the files.
2. Bump `VERSION` in `sw.js` (and `APP_VERSION` in `app.js` if you want Setup to show it).
3. Redeploy. Next time you open the app on your phone, it shows "A new version is ready" with a Reload button.

Default drills live in `DEFAULT_DRILLS` at the top of `app.js`; areas and places are in `AREAS` and `PLACES`. Changing the defaults only affects a fresh install; existing drills are edited in Setup.

## Ideas for later

- Points-based drills (for example a putting game scored out of 30), not only makes out of attempts
- Rounds and handicap tracking alongside practice
- Practice plans: a set of drills to run through in one tap
- Sync between devices
