# Teacher Planner

A lesson-planning app for teachers: flexible class schedules, sequenced lessons that flow around schedule changes, templates, standards, collaboration, shared views, gradebook and seating charts.

Teacher Planner is a **desktop app for Windows, Mac and Linux**. Like Obsidian, your plans are saved as ordinary files in a folder you choose, so they're yours, work offline and are easy to back up.

## Installing (for teachers)

1. Go to **[the Teacher Planner website](https://teachertechtools.org/teacher-planner.html)** and click **Download**. It picks the right installer for your computer:
   - **Windows:** `Teacher-Planner-…-win-x64.exe`. Double-click it. It installs in a few seconds, with no admin rights needed, and adds a desktop shortcut.
   - **Mac:** `Teacher-Planner-…-mac-universal.dmg`. Open it and drag Teacher Planner into Applications.
   - **Linux:** the `.AppImage` (make it executable, then run it) or the `.deb`.
2. On first launch, pick where to keep your planner:
   - **Save my planner in Documents** creates `Documents/Teacher Planner`.
   - **Choose another folder…** lets you pick a folder in **OneDrive, Google Drive or Dropbox** to use the same planner at home and at school. Install the app on both computers and choose the same folder.
3. Start with the sample classes to explore, or start empty.

The app checks for new versions at launch and every few hours, and teachers can check any time under **Settings → Updates** or **Help → Check for Updates…**.
- **Windows and Linux:** the update downloads in the background and installs on restart. A banner offers **Restart to update**.
- **Mac:** the app says a new version is available and opens the website to download it. macOS won't install updates for an app that isn't code-signed, so automatic Mac updates start once the Mac build is signed. Then set `MANUAL_DOWNLOAD` to `false` in `electron/updater.cjs`.

> **First-run security prompts.** The installers aren't code-signed yet, so the computer warns the first time:
> - **Windows** shows "Windows protected your PC". Click **More info → Run anyway**.
> - **Mac** says the app can't be opened. Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. This is needed once.
>
> Both go away once the builds are signed (see *Releasing*).

### In a web browser

**[teachertechtools.org/app](https://teachertechtools.org/app/)** runs the same app in a browser. Nothing to install, so it also works on Chromebooks.
- The planner is saved in that browser on that computer (IndexedDB, with no 5 MB cap). The app asks the browser to keep it, and **Settings → Data** shows whether the browser agreed and when the last backup was made. After the first week it reminds the teacher now and then to **Export backup**, because clearing browsing data erases the planner.
- Signed-in teachers can turn on **Save my plans online** (see below), so their plans are in their account on every computer.
- Each app release attaches `Teacher-Planner-web.zip`. The website repo's *Teacher Planner web app* workflow installs it into `app/` hourly (or when run by hand) and republishes the site.

### Your planner folder

```
Teacher Planner/
  planner.json    your classes, lessons, grades and settings (plain JSON)
  attachments/    files attached to lessons (no size limit)
  backups/        one automatic copy per day, the last 30 days
  README.txt
```

- Saves are atomic, so a crash never leaves a half-written file.
- **To restore a backup:** quit the app and copy a file from `backups/` over `planner.json`.
- **Settings → Data** shows the folder and can open it, or move the planner to a different folder.
- If the file changes underneath the app (for example OneDrive syncing edits from your other computer), the app reloads it automatically. Use one computer at a time: two computers editing at once can overwrite each other's changes.

## Developing

```bash
npm install
npm run dev        # browser version at http://localhost:5173 (saves to IndexedDB)
npm run desktop    # build and run the desktop app
npm test           # schedule engine, sequencing, reports, CSV, iCalendar
npm run dist:linux # build installers locally (also dist:win / dist:mac, on that OS)
```

### Website
The download page teachers use is [teachertechtools.org/teacher-planner.html](https://teachertechtools.org/teacher-planner.html). It lives in the [TeacherTechTools](https://github.com/BlackHargaan/TeacherTechTools) repo (`teacher-planner.html`, `js/teacher-planner.js`, screenshots in `assets/teacher-planner/`).
- **Download buttons:** they look up the newest release here when the page loads and link to the right installer for the visitor's computer, so a new release needs no site changes.
- **State standards catalog:** `.github/workflows/site.yml` also builds `site/standards/` (an `index.json` plus one file per standards document) from the [Learning Commons Knowledge Graph](https://docs.learningcommons.org/knowledge-graph/datasets/us-academic-standards) export with `scripts/build-standards.mjs`, and publishes it to GitHub Pages. It covers math, ELA, science and social studies for all 50 states and D.C. (CC BY 4.0, credited per state in the app). It rebuilds monthly; run the *Website* workflow to refresh it sooner. The built files aren't committed.
- **Old address:** `site/` here only holds a redirect from `blackhargaan.github.io/Teacherplanner/` to the new page, so links in older app versions (Help menu, Mac update notice) still work. It's published by `.github/workflows/site.yml`.

### Online sharing setup (Supabase)
The database lives in Supabase. Everything about who can see what is enforced there by row-level security; the rules are in `supabase/migrations/` and tested in `tests/rls.test.js` against a real Postgres (PGlite).
1. **Database:** the migrations in `supabase/migrations/` are applied to the project (`dldsaiujhowpgryxdnxj`) in filename order. The last one, `*_drop_public_helpers.sql`, is an optional tidy-up to paste into the SQL Editor. Supabase's security advisor is clean apart from the two functions teachers are meant to call (`invite_to_bank`, `accept_invites`).
2. **App key:** the project's **publishable key** is in `src/lib/cloud/config.js`. It's designed to be public, and the GitHub Actions variable `SUPABASE_ANON_KEY` can override it. Never put the secret (`service_role`) key in the app.
3. **Sign-in codes:** in Supabase → Authentication → Emails, edit the **Magic Link** and **Confirm signup** templates to include the code, e.g. `<h2>Your Teacher Planner code: {{ .Token }}</h2>`. By default they send a link, which can't sign in to the desktop app.
4. **Email delivery:** Supabase's built-in email only reaches members of your Supabase team and is heavily rate-limited. To sign in real teachers, add custom SMTP under Authentication → Emails → SMTP, using a provider such as Resend, Postmark or Amazon SES.

### Releasing

Bump `version` in `package.json` (`npm version 0.4.0 --no-git-tag-version`) and commit. Then either:

- go to **Actions → Desktop installers → Run workflow** and tick **publish**, which tags the commit `v<version>` and publishes the release, or
- push a tag yourself: `git tag v0.4.0 && git push origin v0.4.0`.

The **Desktop installers** GitHub Action (`.github/workflows/release.yml`) builds the Windows, Mac and Linux installers and publishes them, with auto-update metadata, on the Releases page. Installed copies find the new release on their own (see *Installing* for how Mac differs). Running the workflow without **publish** only builds the installers as downloadable artifacts.

To remove the security prompts, add code signing:
- **Mac:** an Apple Developer account (US$99/yr). Set the `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` secrets for notarization.
- **Windows:** a code-signing certificate, or Azure Trusted Signing.

Then remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from the workflow.

The first launch can load sample data (three classes, a colleague's shared lesson bank, a roster, grades and two shared views). **Settings → Start fresh** clears it.

## Features

### Class scheduling (`Schedule`, `Classes`)
- School years with **weekly**, **bi-weekly (A/B)** or **rotating cycle** (Day 1…N) schedules, school weekdays and no-school days/ranges.
- **Alternate day schedules** (half day, assembly, planning day) with their own class times. On a cycle schedule you choose whether each one counts as a cycle day.
- Per-day changes from the planner: **add an extra class** or **remove a class** from one day.
- Lesson actions: **bump**, **extend**, **move**, **copy**, **link**, **clear**, **delete & pull back**, plus reordering in the Class list view.
- **Drag and drop** in the week view: drag a lesson to another day of the same class to move it, or onto another class to copy it.
- **Re-use for next year**: copies classes, sections, meeting times, templates, alternate days and holidays (shifted a year), and optionally lessons in order.

Lessons are stored as an ordered sequence per class: lesson *n* is taught at the class's *n*-th meeting. Add a snow day, remove a class or add an extra one, and every later lesson shifts automatically.

### Guided tours
- On first launch a **getting-started tour** walks through the app one highlighted spot at a time (Back / Next / Skip, arrow keys, Esc).
- The first time a teacher opens a page, a small card offers that **page's tour**. Each page has one, and all are in the **?** menu at the top, the desktop app's **Help → Getting Started Tour**, and **Settings → Tours and tips** (where page offers can be turned off or reset).
- Tour text and steps live in `src/lib/tours.js`; anchors are CSS selectors or `data-tour` attributes on the page.

### Search, undo and printable plans
- **Search** (top bar, or <kbd>Ctrl</kbd>+<kbd>K</kbd>, <kbd>/</kbd>, or Edit → Find Lessons) looks through every lesson in every school year: titles, section text, standards, strategies, attachments and your private notes. Each result links to the days the lesson is taught.
- **Undo / redo** for any change (<kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>, the Edit menu, or the **Undo** button on the confirmation message). Quick successive edits, like typing, count as one step.
- **Restore an earlier version** (Settings → Data, desktop app): choose any of the last 30 daily backups. A safety copy of the current planner is kept first.
- **Weekly lesson plans** and **sub plan packets**, from the planner's **Print / PDF** menu or a day's ⋯ menu.
  - The weekly plans can be arranged by day or by class, with options for lesson details, standards and supports.
  - The sub packet has notes for the day, the schedule, each class's lesson, notes for the sub, the class list with student notes, and the seating chart.
  - The desktop app saves real PDF files (Letter or A4 to match the computer's region). The browser version prints, or saves via "Save as PDF".

### Online team lesson banks (sign-in and sharing)
- **Settings → Online account:** sign in with your school email and a one-time code we email you. There's no password, and the first sign-in creates the account.
- **Collaborate → a bank → Sharing → Share this bank online:** invite teammates by email as **Can view** or **Can edit**.
  - Teachers who already have an account are added immediately.
  - Anyone else gets the bank automatically the first time they sign in with that email.
- **Syncing:** changes sync on their own at sign-in, every couple of minutes, when the app is brought back to the front, and live when a teammate changes something. Edits made offline are sent when you're back online and are never overwritten by a download.
- **Privacy:** only the shared banks go online (their sections and lessons). Rosters, grades, student notes and your **private lesson notes** stay on your computer. Files attached from your computer stay there too; links work for everyone.

### Saving your own plans online
- **Settings → Online account → Save my plans online** (off until the teacher turns it on). The planner is saved to the teacher's account as they work, one row per item (`planner_items`, readable only by its owner), and comes along wherever they sign in, in the desktop app or the browser.
- **Student information never goes online.** Before upload, classes lose their roster, student notes, grades, standards scores and seat assignments. Notes to and from substitutes and files stored inside lessons stay on the computer too. Gradebook categories and assignment names, seating-chart layouts and lessons (including private lesson notes) are saved. To bring student information to another computer: **Export backup** there, then **Import student information** (Settings → Data), which fills in rosters, grades and seats for classes in both planners.
- **Merging:** like team banks, each item's last-synced fingerprint is kept, so local edits are uploaded and never overwritten by a download. An item edited on two computers keeps the newer lesson (lessons record when they were edited) or this computer's version otherwise. Deleted items are kept online as empty tombstones so other computers delete them too.
- **First sync on a computer:** with nothing online yet, the planner is uploaded. With nothing here (or only untouched sample data), the online planner is used. With plans in both, the teacher chooses: use the account's planner (a backup of this computer's downloads first; student information for matching classes stays) or replace it with this computer's.
- **Stop saving online** keeps or deletes the online copy. The computer's own planner is untouched either way.
- **Leaving or losing access:** owners can change access, remove people or stop sharing; members can leave. If you lose access, your copy stays read-only, and lessons you linked into your classes are kept.

### Lesson development
- Up to **10 sections** per class/bank, with preset layouts (Standard, 5E, Madeline Hunter, Gradual Release, Workshop, UbD, Simple). Each section has its own color, font (including any custom font name), size and bold setting, and can be shown or hidden.
- Attachments: links, videos, images, files (copied into the planner folder on desktop; ≤1.5 MB in the browser version), Google Drive links, assignments and assessments.
- Custom **status tags** (Draft, Ready, Needs Review, Approved, Taught…).
- Standards, teaching strategies, differentiation and accommodations come from a built-in library, and you can add your own entries.
- Class color, font, text size and display order.
- **Appearance** (Settings): the "Plan Book" look, modeled on a paper teacher plan book. The week is a ruled grid with a row per class and a column per day, a red margin rule and hatched days off. Sections are separated by rules rather than boxed cards, corners are square, and type is IBM Plex Sans with Plex Mono for times. A highlighter mark shows the current page, view and today. It comes in 8 palettes: Sage, Harbor, Heather, Sand & Teal, Slate, Rosewood, Marigold and Graphite. Each has a light and a dark version (or match the computer), all checked for readable contrast in `tests/themes.test.js`. It's saved per teacher, and lesson-section colors stay readable in dark mode.

### Collaboration (`Collaborate`)
- **Team lesson banks** and **shared classes**, with *view* or *edit* access per teacher and **per-section overrides** (hidden / view / edit).
- **Link** shared lessons into your own class starting on any date, picking a range and skipping individual lessons. Linked lessons stay in sync with the source, but the schedule is yours: you can bump, remove or reorder them. You can also **copy** lessons to get an editable version.
- **Private notes** on any lesson, shared ones included, are visible only to you.

### Templates (`Templates`)
- Section content that goes before or after a lesson's own content. It is matched by section name, so one template works across different layouts.
- Templates can carry standards, strategies and attachments, are applied per class, and can be added to or removed from individual lessons.

### Standards (`Standards`)
- Built-in sample frameworks: CCSS Math and ELA, NGSS Middle School, and C3 Social Studies.
- **Create frameworks** or **import CSV** (`framework, subject, code, grade, description`) for state, district, diocese or international standards.
- A **teacher-defined scoring scale**, per-student standard scores, and a class achievement matrix.
- A **coverage report** by class, framework and date range that highlights untaught standards. It can be exported to CSV.

### Shared views (`Shared Views`)
- Views for students, parents/guardians, substitutes, teacher teams and administrators.
- Each view controls:
  - the dates shown (current day, current week, or N days back/ahead)
  - the classes and lesson sections included
  - attachments and standards
  - a lesson status filter (e.g. only "Ready")
- Substitute views include all lesson detail, your **substitute notes** per day/class, student notes, and a box for the sub to leave notes back. Those notes show up in your planner.
- **Open view** gives a read-only page. **Download page** gives a self-contained HTML snapshot to email, post to an LMS or upload to Drive.

### Gradebook, seating, Google
- Weighted categories, assignments linked to standards, score entry, averages and letter grades, per-student reports and CSV export.
- Seating charts: several layouts per class, editable desk grid (aisles), drag-and-drop, swap, random or alphabetical fill, and printing.
- Google Calendar: `.ics` export of classes and lessons, plus per-lesson "Add to Google Calendar" links.
- Google Classroom: "Share to Classroom" links for lesson attachments.
- Google Drive: Drive-link attachments.

## Current limitations
- **Your own planner lives on your computer**, in a planner folder (desktop) or the browser. Saving online is optional; without it, the desktop app syncs between computers through a cloud-drive folder used by one computer at a time. Rosters, grades and student notes never go through the server (Supabase).
- **Supabase's free plan pauses a project after about a week with little use**, which stops sign-in, sharing and saving online until it's restored from the dashboard (planners keep working, as they're saved locally). A paid plan avoids this.
- **Shared classes and Shared Views are local.** Sharing a class with a colleague works within one planner folder, and Shared Views are opened or downloaded as pages rather than hosted online.
- **Google integration doesn't use OAuth.** It relies on file export and share links rather than API sync, so there's no automatic Classroom posting or Drive picker yet.

## Code map
| Path | Purpose |
| --- | --- |
| `src/lib/schedule.js` | School days, day keys (weekly / A-B / cycle), alternate days, overrides → calendar of class meetings |
| `src/lib/sequence.js` | Pure lesson-sequence operations (bump, extend, move, insert…) |
| `src/lib/model.js` | Data model factories, permissions, templates, year rollover, sample data |
| `src/lib/reports.js` | Standards coverage, achievement, weighted grade averages |
| `src/lib/ics.js` | iCalendar export and Google Calendar / Classroom links |
| `src/pages/*` | One file per screen |
| `src/lib/cloud/` | Online account, team-bank and school-profile sync: `sync.js`, `schoolSync.js` and `plannerSync.js` (pure merge/push logic), `backend.js` (Supabase calls), `CloudProvider.jsx` (when to sync) |
| `supabase/migrations/` | Database tables and row-level security for sign-in and sharing |
| `electron/main.cjs` | Desktop shell: planner folder, atomic saves, daily backups, file watching, attachments, menus |
| `electron/updater.cjs` | Update checks, background download and restart-to-update (website download on Mac) |
| `electron/preload.cjs` | The narrow bridge (`window.plannerHost`) between the UI and the file system |
