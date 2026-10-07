# NBANA APP — Norberto Bana Sr. Mem. SDA Elementary School

A static school website with a student portal, built with plain HTML, CSS, and vanilla JavaScript — no build step required.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Landing page — hero, counters, quick links, events, FAQ |
| `about.html` | About the school |
| `students.html` | Student information |
| `login.html` | Sign in + sign-up with mandatory enrollment survey |
| `portal.html` | Portal — dashboard, grades, attendance, schedule, assignments, announcements, messages, concerns, profile |

Demo accounts (all password `nbana123`):

| Role | Email | Sees |
| --- | --- | --- |
| Student | `juan.delacruz@nbana.edu.ph` | Tuition, grades, attendance, schedule, assignments, announcements, profile |
| Teacher | `joy.lomongo@nbana.edu.ph` | Her own grade level only — grades, attendance, schedule, assignments, posts. No tuition. |
| Principal / Admin | `principal@nbana.edu.ph` | Everything: tuition, every student record, school year promotion, announcements |

The portal is local-first: every screen reads and writes this browser's `localStorage`, so it keeps
working offline, and a background sync copy is kept in Supabase.

## Cloud sync (Supabase)

`supabase-config.js` holds the project URL and the **publishable** key (safe to ship to the browser —
never put the secret key there). `supabase-sync.js` syncs these through one table, `nbana_records`,
tagged by `kind`:

| kind | what it holds |
| --- | --- |
| `account` | every account field except the reversible password copy |
| `post` | feed posts (photos/videos upload to the `nbana-media` bucket) |
| `thread` | student ↔ teacher conversations and messages |
| `concern` | Contact School concerns and replies |
| `pwreq` | forgot-password requests |
| `grades`, `attendance`, `schedule`, `notice` | school records |

Setup is one paste of `supabase-schema.sql` into the Supabase SQL Editor, plus a public bucket named
`nbana-media` (Storage → New bucket). Set `enabled: false` in `supabase-config.js` to run purely
offline. Note: this demo signs users in with its own account records, so the table's access rule is
permissive (Supabase's Security Advisor flags it) — move to Supabase Auth before real student data.

## Account types & the staff secret code

The **Create Account** tab has an account-type toggle — **Student** is the default and needs no code.
**Teacher** and **Admin** accounts additionally require the school's *staff secret code* (set as
`STAFF_CODE` in `app.js`; the principal issues it). The same code is required when the principal creates
a teacher or admin account from **Portal → Students → + New account**. Changing the code in `app.js`
rotates it for the whole site.

## The student dashboard

When a student signs in the dashboard starts with a friendly greeting (**Good morning / Good afternoon /
Good evening**) in a bright, round, kid-friendly theme (student accounts only — staff keep the plain
look), a positive quote under the greeting with an **Another quote** button, then the **Announcements &
school events** feed. Scrolling continues into the *Past events & school memories* list. The tuition
balance is deliberately **not** shown first: it is the last summary card, below the announcements.

## Teacher posts need approval

A teacher post is saved with `status: 'pending'` and is **not visible to students** until the principal
approves it. The principal/admin sees a bell in the portal header with a count, a badge on the sidebar
**Approvals** item, and can Approve or Reject each post. The teacher always sees their own post with a
*Waiting for approval* / *Not approved* / *Published* label. Principal posts publish immediately.

## Profiles and profile pictures

Every portal user — students, teachers, and admins — can edit their own information from **My Profile**
and add a **profile picture** (compressed to a small JPEG and stored in `localStorage`). The picture
appears beside their name in the sidebar, the announcement feed, the faculty list, and Messages.

The **principal/admin** reviews student pictures from **Students → Photo**: they can mark a picture
*Looks good*, or **remove it with a written reason**, which clears the photo and sends the student a note
(shown in *Contact School → Messages from the school office* and counted in the student's bell) telling
them why it was removed and to upload a new one.

## Faculty & staff

The sidebar **Faculty & Staff** page lists every class adviser (Kinder 1 to Grade 6), the principal and
administrators, and whether each staff member already has a portal account.

## Bible verses on the dashboard

The student dashboard shows a **motivational Bible verse** under the greeting (a different verse each day,
with an *Another verse* button to cycle through them).

## Contact School and Messages

- **Contact School** (students only): a student picks a category, writes a concern, and only the
  **principal/admin** sees it — teachers have no access to this section at all. The office replies in the
  same thread and can mark a concern resolved.
- **Messages**: a Messenger-style chat between a student and their class adviser (thread list, chat
  bubbles, timestamps, unread counters).
- The **principal/admin** gets a read-only *Message monitoring* view listing every
  **student → teacher** conversation, so the office can see who is messaging which teacher, plus a
  **switch** at the top of Messages to change between **Teacher ↔ Student** messages and **Concerns**.
  Everything is stored, so switching the view off and on again still shows every past message.

## School year & grade promotion

The principal (or any admin account) can change the school year from **Portal → Students →
School year & grade promotion**. Confirming a new school year moves every enrolled student up one
grade level (Kinder 1 → Kinder 2 → … → Grade 6), updates each student's school year and billing
school year, and marks Grade 6 leavers as *Graduated* (they keep portal access but leave the active
roster). A preview lists every move before anything is saved.

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
