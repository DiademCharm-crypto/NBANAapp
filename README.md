# NBANA APP — Norberto Bana Sr. Mem. SDA Elementary School

A static school website with a student portal, built with plain HTML, CSS, and vanilla JavaScript — no build step required.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Landing page — hero, counters, quick links, events, FAQ |
| `about.html` | About the school |
| `students.html` | Student information |
| `login.html` | Sign in + sign-up with mandatory enrollment survey |
| `portal.html` | Student portal — tuition balance, grades, attendance, schedule, assignments, announcements, profile |

Demo account: `juan.delacruz@nbana.edu.ph` / `nbana123`

All data (accounts, payments, survey answers) is stored in the browser's `localStorage`.

## Run locally

```
node auto-upload.js          # also watches + uploads changes
```

Or serve the folder with any static server, e.g. `npx serve .`.

## Auto upload to GitHub

Running `node auto-upload.js` watches the folder and, after 3 seconds of quiet, commits and pushes all site changes to `main` on [DiademCharm-crypto/NBANAapp](https://github.com/DiademCharm-crypto/NBANAapp).

- Double-click `start-auto-upload.bat` to run it, or run `node auto-upload.js` in a terminal.
- `.freebuff/` is ignored via `.gitignore`.
- Manual alternative: `git add -A && git commit -m "Update" && git push`.
