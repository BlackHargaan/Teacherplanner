# Teacher Planner

A lesson-planning app for teachers: flexible class schedules, sequenced lessons that flow around schedule changes, templates, standards, collaboration, shared views, gradebook and seating charts.

Teacher Planner is a **desktop app for Windows, Mac and Linux**. Like Obsidian, your plans are saved as ordinary files in a folder you choose, so they're yours, work offline and are easy to back up.

## Installing (for teachers)

1. Go to **[the Teacher Planner website](https://blackhargaan.github.io/Teacherplanner/)** and click **Download**. It picks the right installer for your computer:
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
npm run dev        # browser version at http://localhost:5173 (saves to localStorage)
npm run desktop    # build and run the desktop app
npm test           # schedule engine, sequencing, reports, CSV, iCalendar
npm run dist:linux # build installers locally (also dist:win / dist:mac, on that OS)
```

### Website

The landing page teachers download from lives in `site/`. It's plain HTML, CSS and JS with no build step, and is published to GitHub Pages by `.github/workflows/site.yml` whenever `site/` changes.
- **Download buttons:** they look up the newest release when the page loads and link to the right installer for the visitor's computer, so a new release needs no site changes.
- **Preview locally:** `python3 -m http.server --directory site`.
- **Screenshots:** they're in `site/assets/`. Retake them when the app's look changes.
- **One-time setup:** in the repo's **Settings → Pages**, set *Source* to **GitHub Actions**.
- **Custom domain (optional):** add it under Settings → Pages, and add a `site/CNAME` file containing the domain.

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

### Search, undo and printable plans
- **Search** (top bar, or <kbd>Ctrl</kbd>+<kbd>K</kbd>, <kbd>/</kbd>, or Edit → Find Lessons) looks through every lesson in every school year: titles, section text, standards, strategies, attachments and your private notes. Each result links to the days the lesson is taught.
- **Undo / redo** for any change (<kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>, the Edit menu, or the **Undo** button on the confirmation message). Quick successive edits, like typing, count as one step.
- **Restore an earlier version** (Settings → Data, desktop app): choose any of the last 30 daily backups. A safety copy of the current planner is kept first.
- **Weekly lesson plans** and **sub plan packets**, from the planner's **Print / PDF** menu or a day's ⋯ menu.
  - The weekly plans can be arranged by day or by class, with options for lesson details, standards and supports.
  - The sub packet has notes for the day, the schedule, each class's lesson, notes for the sub, the class list with student notes, and the seating chart.
  - The desktop app saves real PDF files (Letter or A4 to match the computer's region). The browser version prints, or saves via "Save as PDF".

### Lesson development
- Up to **10 sections** per class/bank, with preset layouts (Standard, 5E, Madeline Hunter, Gradual Release, Workshop, UbD, Simple). Each section has its own color, font (including any custom font name), size and bold setting, and can be shown or hidden.
- Attachments: links, videos, images, files (copied into the planner folder on desktop; ≤1.5 MB in the browser version), Google Drive links, assignments and assessments.
- Custom **status tags** (Draft, Ready, Needs Review, Approved, Taught…).
- Standards, teaching strategies, differentiation and accommodations come from a built-in library, and you can add your own entries.
- Class color, font, text size and display order.
- **Appearance** (Settings): 8 color palettes (Classic Blue, Teal, Forest, Sunset, Crimson, Berry, Grape, Graphite), with light, dark or match-computer mode. It's saved per teacher, and lesson-section colors stay readable in dark mode.

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
- **No server yet.** Your own planner syncs between your computers through a cloud-drive folder. Team members and permissions work within one planner folder (e.g. a team computer, or a folder a team shares, used by one person at a time). Live multi-teacher editing and public share links need a backend with accounts.
- **Standards library is a sample.** Certified frameworks for every state and district would have to be licensed or curated and loaded through the CSV import or a future API.
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
| `electron/main.cjs` | Desktop shell: planner folder, atomic saves, daily backups, file watching, attachments, menus |
| `electron/updater.cjs` | Update checks, background download and restart-to-update (website download on Mac) |
| `electron/preload.cjs` | The narrow bridge (`window.plannerHost`) between the UI and the file system |
