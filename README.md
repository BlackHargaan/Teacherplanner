# Teacher Planner

A lesson-planning app for teachers: flexible class schedules, sequenced lessons that flow around schedule changes, templates, standards, collaboration, shared views, gradebook and seating charts.

Built with React + Vite. Everything runs in the browser and data is saved to `localStorage`, with JSON backup/restore.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # schedule engine, sequencing, reports, CSV, iCalendar
npm run build    # static site in dist/
```

The first launch loads sample data (three classes, a colleague's shared lesson bank, a roster, grades and two shared views). **Settings → Start fresh** clears it.

## Features

### Class scheduling (`Schedule`, `Classes`)
- School years with **weekly**, **bi-weekly (A/B)** or **rotating cycle** (Day 1…N) schedules, school weekdays and no-school days/ranges.
- **Alternate day schedules** (half day, assembly, planning day) with their own class times. On a cycle schedule you choose whether each one counts as a cycle day.
- Per-day changes from the planner: **add an extra class** or **remove a class** from one day.
- Lesson actions: **bump**, **extend**, **move**, **copy**, **link**, **clear**, **delete & pull back**, plus reordering in the Class list view.
- **Re-use for next year**: copies classes, sections, meeting times, templates, alternate days and holidays (shifted a year), and optionally lessons in order.

Lessons are stored as an ordered sequence per class: lesson *n* is taught at the class's *n*-th meeting. Add a snow day, remove a class or add an extra one, and every later lesson shifts automatically.

### Lesson development
- Up to **10 sections** per class/bank, with preset layouts (Standard, 5E, Madeline Hunter, Gradual Release, Workshop, UbD, Simple). Each section has its own color, font (including any custom font name), size and bold setting, and can be shown or hidden.
- Attachments: links, videos, images, files (≤1.5 MB, stored in the browser), Google Drive links, assignments and assessments.
- Custom **status tags** (Draft, Ready, Needs Review, Approved, Taught…).
- Standards, teaching strategies, differentiation and accommodations come from a built-in library, and you can add your own entries.
- Class color, font, text size and display order.

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
- **No server yet.** Data lives in one browser. Team members and permissions work for teachers using the same device or a shared backup, but real multi-device collaboration and public share links need a backend with accounts.
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
