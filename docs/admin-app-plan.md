# School Leader app: planning outline

> **What this file is.** A build plan for an administrator companion to Teacher Planner, written so an AI coding agent (or a developer) can pick it up phase by phase. Read sections 1–5 before writing any code. They set the constraints that every feature depends on. Sections 6–9 are the feature modules. Sections 10–13 are the build order, testing and open questions.
>
> **Working name:** *School Leader* (admin side of Teacher Planner). Rename freely.

---

## 1. Ground rules carried over from Teacher Planner

These held the teacher app together. Keep them.

1. **Teachers own their work.** A teacher's lessons, notes, rosters and grades are theirs. The admin app sees only what a teacher (or the school, for school-owned data) has explicitly shared, and the teacher can always see exactly what is shared.
2. **Privacy is enforced in the database, not the UI.** Every table has row-level security (RLS). Every policy has a test in PGlite (`tests/rls.test.js` pattern) covering each role: owner, admin, coach, teacher, stranger, and signed out.
3. **Never use the `service_role` key** in any client, script or test. Privileged operations go through narrow `security definer` RPCs in the `private`/`public` schemas, with input validation, like `join_school` and `invite_to_bank`.
4. **Pure logic in `src/lib`, tested with Vitest.** Network code (`backend.js`) and React components stay thin. Merge logic, permission checks, report math and calendar math are pure functions with unit tests.
5. **Plain language.** Labels and errors are written for a busy principal, not an engineer ("No school uses that code. Check it and try again.").
6. **Undo for anything destructive** and a confirmation listing exactly what changes, as in the "Join your school?" dialog.
7. **Offline edits are never overwritten by a download.** Use the shadow fingerprint pattern from `src/lib/cloud/sync.js` and `schoolSync.js`.
8. **Accessible by default.** Real labels, keyboard operation, focus management, color is never the only signal. Public school districts are covered by the US DOJ ADA Title II web rule, which requires WCAG 2.1 AA. Treat that as a hard requirement, because districts will ask.

---

## 2. Who "admin" is: personas and jobs

Design for these people separately. They have different permissions and very different days.

| Persona | Typical title | What they need from the app | Device reality |
| --- | --- | --- | --- |
| **School leader** | Principal, assistant principal | Calendar authority, plan oversight, walkthroughs, staff communication, compliance reports | Laptop in office, **tablet or phone in hallways** |
| **Instructional coach** | Coach, curriculum facilitator, MTSS coordinator | Plan feedback, pacing, coverage of standards, PLC support, coaching cycles | Laptop, tablet in classrooms |
| **Team or department lead** | Grade-level chair, department head | Team banks, pacing for their team, PLC agendas, light oversight of their team only | Same as teacher |
| **Office or scheduling staff** | Data manager, secretary, registrar | Calendar entry, bell schedules, staff directory, sub coverage board, duty rosters | Desktop |
| **District leader** | Curriculum director, district office | Pacing guides and banks pushed to many schools, roll-up reports, calendar for all schools | Desktop |
| **Substitute** (guest) | Daily sub | Today's plans, seating chart, notes to leave back | Phone, school laptop |

**Jobs to be done, ranked by value to a school leader:**
1. "Change the school calendar once (snow day, two-hour delay, testing week) and every teacher's planner updates." *(Half built: step 4, school profiles.)*
2. "Know which teachers have turned in next week's plans, read them, and leave feedback without a pile of emailed Word documents."
3. "Walk into a room and instantly see what's supposed to be happening there right now, then record a walkthrough in under two minutes."
4. "See whether we're on pace and which standards haven't been taught, by grade and subject."
5. "When a teacher is out, get sub plans and arrange coverage before 7:30 am."
6. "Prove compliance: instructional days and minutes, required observations completed, plan submission rates."

---

## 3. The big architectural decision

### 3.1 The teacher app is local-first; the admin app can't be

Teacher Planner stores everything in `planner.json` on the teacher's computer. Only shared banks and the school profile go online. An admin dashboard needs data from 40 teachers at once, so **some teacher data has to be published to the server**. That's a consent and privacy problem before it's a technical one. It is the single most important design area, so it gets section 4.

### 3.2 Recommendation: one repository, a shared core, two front ends

```
src/
  lib/            shared, pure: schedule.js, calendarPaint.js, bells.js, icsImport.js,
                  reports.js, standardsCatalog.js, sequence.js, cloud/sync.js, cloud/schoolSync.js
  teacher/        today's src/pages + components (Electron desktop, local-first)
  admin/          new: pages + components for School Leader (web + installable PWA)
  shared-ui/      ui.jsx, Modal, Field, toasts, theme tokens, YearCalendar, BellSchedule
```

- **Ship the admin app as a web app and PWA first, not Electron.** Leaders move around the building; walkthroughs happen on iPads and phones. It needs no planner folder and no local files; data lives in Supabase. Host it on the existing domain, for example `admin.teachertechtools.org` (Cloudflare or GitHub Pages). It's the same Vite build with a second entry point (`admin.html`).
- Add a "Leader" mode to the Electron teacher app later if desktop demand appears. Many APs also teach a class.
- **Phones matter here**, unlike the teacher app. The walkthrough, today's board, calendar emergency changes and the sub coverage board must work well at 375px wide. Desktop-only is fine for analytics.

### 3.3 Backend

Keep Supabase (project already in use; Auth, RLS, Realtime, Edge Functions, pg_cron all needed):
- **Auth:** keep the email one-time code; add **Google and Microsoft sign-in** (districts run on Google Workspace or Microsoft 365). Optionally require that school members use the district email domain (school setting).
- **Realtime:** already used for banks and schools; extend to plan submissions, feedback, announcements and the coverage board.
- **Edge Functions + pg_cron:** reminder emails ("Plans for next week are due Friday at 4"), daily digest to leaders, weekly coverage summary. Email goes out via Resend (already configured for sign-in). The Resend key lives only in Supabase secrets.
- **Storage (bucket):** only for school-owned files (handbook PDFs, announcement attachments). Teacher attachments stay local unless a teacher shares a lesson that links to a URL.

---

## 4. Data sharing and privacy model (design this first)

### 4.1 Sharing tiers

Every piece of data belongs to one tier. Higher tiers need more explicit consent and more legal cover.

| Tier | Data | Who decides | Default |
| --- | --- | --- | --- |
| **0: School-owned** | Calendar, days off, bell schedules, grading periods, announcements, duty rosters, pacing guides, rubrics | School leaders | Shared with all members *(exists: school profiles)* |
| **1: Plan metadata** | Per class: name, period, room, subject, grade; per lesson: date, title, standards, status | Teacher, per class | **Off** until the teacher turns on "Share my plans with my school" |
| **2: Plan content** | Full lesson sections, attachments as links, templates | Teacher, per class, at submission time | Shared only as **submitted snapshots** (section 7) |
| **3: Professional records** | Walkthrough and observation notes, feedback, coaching logs | Written by leader; **always visible to the teacher it's about** (except leader drafts) | Private to the authoring leader until shared |
| **4: Student data** | Rosters, grades, student notes, seating, accommodations | Not collected in v1 | **Never uploaded** in phases 0–4. See section 9.4 |

Rules:
- **Private lesson notes never leave the teacher's computer** (same rule as banks today).
- A teacher can see a "Visible to your school" badge on anything at tier 1–2, and a page "What my school can see" listing it all. Trust is the product. If teachers feel watched, they'll stop using the teacher app.
- **No surveillance signals.** Don't expose edit timestamps, time-of-day activity, typing history, or "last opened". Show submission time only for a submission, because the teacher chose to submit.
- Leaving a school (or being removed) stops publishing immediately; previously published tier 1–2 data is deleted from the server within a defined window (for example right away for live data, kept as submitted snapshots only if the school's records policy requires it, and say so in the consent text).

### 4.2 Legal and policy checklist (for the product owner, not the AI)

- FERPA: once any student data is stored (tier 4) the service acts as a "school official" under the district's direct control. That needs a **data privacy agreement (DPA)**; many states have a standard one through the Student Data Privacy Consortium. Tiers 0–3 hold no student records, which is why v1 stops there.
- State student-privacy laws (vary by state) and district acceptable-use policies.
- Personnel records: observation notes may become part of an employee's file and are subject to public-records requests in some states. Make retention and "draft vs shared" explicit, and let districts export them.
- Data retention and deletion: an owner can export everything for their school, and delete the school, with a 30-day soft-delete grace period.
- Accessibility (WCAG 2.1 AA) and a published accessibility statement.
- A plain-language privacy page on teachertechtools.org that says exactly the tier table above.

---

## 5. Organization, roles and permissions

### 5.1 Model

```
district (optional) ─┬─ school ─┬─ teams (grade level, department, PLC)
                     │          ├─ members (person + school role + team roles)
                     │          └─ school-owned data (calendar, rubrics, announcements…)
                     └─ district-owned data (pacing guides, district calendar, banks)
```

Today `schools` has `owner_id` and `school_members(role: admin|member)`, where "admin" means "can edit the shared schedule". Evolve it rather than replace it. Migrate the old roles as follows:

| New role | Migrates from | Meaning |
| --- | --- | --- |
| `owner` | `schools.owner_id` | Everything, including deleting the school and transferring ownership |
| `leader` | (new) | Principal or AP: all leader features for the school |
| `calendar_editor` | `admin` | Can edit tier-0 calendar and bell data only |
| `coach` | (new) | Plan feedback, coaching, pacing and coverage reports; **no** formal evaluations unless granted |
| `office` | (new) | Calendar, directory, sub coverage, duties; no plans or observations |
| `teacher` | `member` | Teacher; sees tier 0, their own records, team items |
| `team_lead` | (team-scoped) | Leader-lite powers for one team only |
| `guest_sub` | (new, time-limited) | One day's plans for one teacher, via a link or code that expires |

Store roles as a set (a person can be `teacher` + `team_lead` + `calendar_editor`). Put the permission matrix in one pure module (`src/lib/permissions.js`) used by the UI, and mirror it in SQL helpers (`private.has_school_perm(school, perm)`). One test table drives both the JS tests and the RLS tests.

### 5.2 Permission matrix (v1)

| Permission | owner | leader | coach | office | team_lead | teacher |
| --- | --- | --- | --- | --- | --- | --- |
| Edit calendar & bells | ✓ | ✓ | | ✓ | | |
| Manage members & roles | ✓ | ✓ (not owner) | | invite only | | |
| Read shared plans (tier 1–2) | ✓ | ✓ | ✓ | | own team | own |
| Give plan feedback | ✓ | ✓ | ✓ | | own team | |
| Walkthroughs (informal) | ✓ | ✓ | ✓ | | | own (read) |
| Formal observations | ✓ | ✓ | if granted | | | own (read when shared) |
| Announcements | ✓ | ✓ | team only | ✓ | team only | read |
| Sub coverage board | ✓ | ✓ | | ✓ | | own absences |
| School reports | ✓ | ✓ | ✓ (no evaluation data) | calendar only | own team | own |
| Delete school / transfer | ✓ | | | | | |

---

## 6. Module A: School calendar command center (extends step 4)

**Already built:** school profile (`schools.data`), join code, read-only members, admins edit, live sync, leave/delete keeps a copy.

**Add:**
1. **Change notices.** When the calendar changes, every member gets a notice in their planner: "Jan 12 is now a cancelled day (snow). Lessons after it moved one day." Store a `school_calendar_changes` log (who, when, summary, before/after diff of `nonSchoolDays`, `dayAssignments`, periods). The teacher app shows unseen changes once, with a link to the affected week. This reuses the diff of `schoolData()` before and after.
2. **Draft and publish.** Big edits (next year's calendar, a new bell schedule) are prepared as a draft and published on a date. Add `schools.draft` jsonb and `publish_at`. Teachers keep the current one until then.
3. **Emergency actions from a phone.** These need to be one-tap, two-confirm: "Cancel school today", "Two-hour delay today", "Early release today" (applies a school day type to the date). They send a push/email notice. This is the one admin screen that must be perfect on a phone.
4. **Multiple bell schedules per school.** Grade bands with different lunches (6th vs 8th), A/B lunch. Today `periods` is one list; add `bellSchedules: [{ id, name, appliesTo: gradeBands|teams, periods }]`, with each member's default. *Engine change:* `schedule.js` resolves periods per teacher's assigned schedule. Write that as a pure function with tests first.
5. **Instructional time calculator.** From the bell schedule × school days, minus early releases and cancelled days: days and minutes per grading period and for the year, versus the state requirement (configurable; North Carolina, for example, requires 185 days or 1,025 hours; confirm the current rule). Show the gap when snow days pile up, and suggest make-up dates (next workday/holiday candidates). This is all pure date math on top of `schedule.js`.
6. **Testing windows and events.** School-wide events that aren't days off (state testing window, picture day, assemblies) appear on teachers' planners as banners, optionally with a school day type (assembly schedule).
7. **District layer.** A district calendar that schools inherit and can add to (school-specific early releases). Store as a parent profile; resolve district + school with clear precedence rules and tests.
8. **Import.** The ICS import exists (`icsImport.js`). Add **PDF calendar assist**: many districts only publish PDFs. Extract text in the browser (pdf.js), propose dates with the same review table as the ICS import, and never apply without review.

**Acceptance:** a leader cancels tomorrow from a phone in under 20 seconds; every teacher who opens their planner sees the change and the lesson shift; the change log shows who did it; instructional minutes update.

---

## 7. Module B: Lesson plan submission and feedback

The core weekly loop for most schools. Replace emailed plans.

### 7.1 Teacher side (teacher app changes)

- Settings → School: "Share my plans with my school" per class (tier 1), with the "What my school can see" page.
- **Submit plans** button on the week view: choose classes (default all shared), week, optional note. It uploads a **snapshot** (rendered lesson content for that week, using the same rendering as Shared Views/Print), not a live link, so later edits don't silently change what was reviewed. "Resubmit" creates version 2 and shows a diff.
- **Feedback inbox:** comments from leaders/coaches, anchored to a lesson and section, with replies. Shown on the lesson in the planner (a badge on the lesson card) and in a list.
- Status flows into the existing custom statuses (`DEFAULT_STATUSES` already has "Approved", "Needs Review").

### 7.2 Leader side

- **Submission board:** teachers × weeks grid, with Submitted (on time/late), Not yet, Returned for changes, Reviewed, Excused. Filters by team, subject, grade. One-click reminder (rate-limited, polite template).
- **Reader:** a teacher's submitted week, laid out like the printed weekly plan, with a comment sidebar (anchor to a lesson section; quick "look-for" tags such as *learning target posted*, *checks for understanding*, *differentiation*, configurable per school).
- **Outcome:** Reviewed, Reviewed with comments, Returned (with required changes). The teacher is notified.
- **Settings:** due day and time (for example Friday 4:00 pm for next week), which classes are required (core only?), exemptions, reminder schedule.

### 7.3 Data

```
plan_shares        (school_id, teacher_id, class_key, class_meta jsonb, enabled)
plan_submissions   (id, school_id, teacher_id, week_start, version, submitted_at,
                    note, snapshot jsonb, status, reviewed_by, reviewed_at)
plan_comments      (id, submission_id, lesson_key, section_name, author_id, body,
                    parent_id, created_at, resolved_at)
```

RLS: a teacher reads and writes their own submissions; leaders and coaches read in their school (team leads: their team's members); comments are readable by the teacher and the school's reviewers; nobody else.

**Acceptance:** the snapshot never contains private notes or student data (test it); a leader's comment appears on the teacher's lesson within seconds (Realtime) or at next sync; resubmission keeps version 1 readable.

---

## 8. Module C: Walkthroughs, observations and "what's happening now"

### 8.1 "Now" board (the killer feature)

The engine already knows, for every teacher who shares tier 1, which class meets in which period in which room, and which lesson is scheduled. So:
- **Room or teacher lookup:** "Room 204 → Ms. Rivera, Period 3, Grade 7 Science, *Photosynthesis lab*, standards 7.L.1.2."
- **Building board:** all rooms right now, filterable by hallway, grade or subject. Great for a principal's morning walk.

This needs only tier 1 plus the lesson title, and it is computed from the published teacher schedule and `schedule.js`. Keep the computation pure: `nowAt(school, teachers, dateTime) → [{ room, teacher, class, lesson }]`.

### 8.2 Walkthrough (informal, fast)

- Opens pre-filled from the "now" board: teacher, class, lesson, standards.
- A configurable short form: checkboxes and a 1–4 scale for 3–8 look-fors, an optional photo of student work (no student faces; warn), and a short note. The goal is under 2 minutes on a phone.
- **Offline-capable** (hallway Wi-Fi is bad): queue locally and sync with the same shadow and push pattern.
- Sharing: **Shared with the teacher** (default, and sends a notice) or **Draft**. Teachers can reply ("Thanks, we did the exit ticket after you left").

### 8.3 Formal observations (structured, longer)

- A rubric template editor. **Do not hard-code a state rubric**; ship generic templates (for example a Danielson-style domain/component structure or a blank template) and let districts load their own. Many states have an official evaluation platform; the app supports the work and exports to it, it doesn't replace it.
- Cycle: schedule pre-conference → observation (evidence notes, timestamped, tagged to rubric elements) → post-conference → summary shared → teacher acknowledgement (not agreement) and optional response.
- **Evidence scripting mode:** a big text box with timestamps and one-tap tags.
- Counts toward requirements: "Novice teachers need 4 observations by March." Requirements are configurable per role or license type.

### 8.4 Coaching cycles (for coaches)

Goal → planned visits → notes → resources (link a bank lesson) → reflection. Visible to the teacher at all times. **Coaching notes are not evaluative** and are not visible to leaders unless the teacher shares them. That separation matters to coaching culture, so enforce it in RLS.

### 8.5 Data

```
observation_templates (id, school_id|district_id, kind: walkthrough|formal|coaching, name, schema jsonb)
observations          (id, school_id, template_id, observer_id, teacher_id, kind, started_at,
                       class_meta jsonb, lesson_meta jsonb, responses jsonb, notes, status:
                       draft|shared|acknowledged, shared_at, acknowledged_at, teacher_response)
observation_media     (id, observation_id, storage_path)   -- school bucket, signed URLs
```

RLS: the observer and permitted leaders read; the teacher reads once `status != 'draft'`; coaching kind is readable by the coach and the teacher only.

---

## 9. Modules D–H

### 9.1 Module D: Curriculum, pacing and standards coverage

- **District or school pacing guides** as lesson banks (`banks` exists) with planned dates or week numbers. Push to teams: teachers link them into classes (the link feature exists).
- **Pacing status** per teacher and class: where the teacher's sequence is versus the guide (ahead/on/behind by N days), computed by matching linked lesson ids, or standards when not linked. Use a pure function with tests.
- **Coverage roll-up:** `reports.js` already has coverage by class and framework and date range. Aggregate across teachers (grade × subject × standard heat map) from tier 1 standards data. Highlight untaught standards before testing windows.
- **Common assessments:** a bank of shared assessments with standards tags (results stay out until tier 4 is approved).
- **State catalog:** reuse `standardsCatalog.js` and the published Learning Commons catalog (CC BY 4.0; keep the attribution).

### 9.2 Module E: Absences, sub plans and coverage

- A teacher marks an absence (date, full or part day, reason category only, no medical detail). The **sub packet** already exists in the teacher app; publish it as a tier-2 snapshot for that day.
- **Coverage board** (office/leader): absent teachers × periods → assign a sub, an internal cover (teachers on planning that period, computed from the schedule) or a split class. Track coverage fairness (how many times each teacher has covered this month).
- A **guest sub link**: time-boxed (that day), one teacher's packet, seating chart, notes back to the teacher (exists in shared views). The seating chart and student notes in the packet are tier 4; keep them **local-generated** (a downloaded or printed packet from the teacher app) unless the DPA covers it.
- Integrations: import or export with the district's absence system (most districts use a vendor product); start with CSV.

### 9.3 Module F: Staff, teams, duties and communication

- **Directory:** members, roles, teams, room, planning period (from the bell grid), and contact preference.
- **Onboarding:** invite by email list or CSV; join code (exists); domain auto-join option; pending invitations like `bank_invites`.
- **Offboarding:** remove member → transfer ownership of their school-owned banks; their personal data is untouched.
- **Duty rosters:** bus, lunch and hallway duties on a rotation; shown on teachers' planners as a small line on the day ("Lunch duty 11:30"). Ship it as a school day annotation with the same engine.
- **Announcements:** to everyone, a team or a role; pinned; optional "must acknowledge" (for policy updates); schedule a send time. Shown in the teacher app header and emailed per each person's preference. **No read tracking by default** (trust), only acknowledgement when explicitly required.
- **Meetings/PLCs:** agenda template, notes, action items linked to banks and standards; attendance optional.

### 9.4 Module G: Student data (phase 6 and later, gated)

Only with a signed DPA and a clear need:
- Roster sync via **OneRoster** (the 1EdTech standard most SIS products export) instead of manual entry.
- Grade and intervention roll-ups (MTSS tiers), common assessment results by standard.
- Encryption at rest is a given with Supabase; add field-level minimization, per-school data residency notes, export and deletion APIs, access logging on every read of student data.
- Until then, **all student data stays in teachers' local planners**. Say this loudly in marketing; it is a selling point to cautious districts.

### 9.5 Module H: Reports and exports

| Report | Source | Who |
| --- | --- | --- |
| Instructional days and minutes vs requirement | Calendar + bells | Leader, office, district |
| Plan submission rate by week, team, teacher | `plan_submissions` | Leader |
| Feedback given and turnaround time | `plan_comments` | Leader, coach (own) |
| Observation completion vs requirements | `observations` | Leader |
| Standards coverage heat map, untaught standards | Tier 1 standards | Leader, coach, team lead |
| Pacing status | Banks + sequences | Leader, coach, team lead |
| Coverage and fairness | Coverage board | Leader, office |

Every report gets **CSV export** (reuse `toCSV` in `src/lib/csv.js`, after adding a guard against spreadsheet formula injection: prefix cells starting with `=`, `+`, `-`, `@` with `'`; test it) and a printable view (reuse Print). Report math lives in pure functions with fixtures.

### 9.6 Audit log

`audit_log (id, school_id, actor_id, action, target_table, target_id, summary, created_at)` written by triggers on school-owned tables, role changes, observation sharing and exports. Leaders read their school's log; nobody can update or delete it (no UPDATE/DELETE policies; test it).

---

## 10. Teacher app changes required (the other half of the system)

1. Settings → **School** page: membership, roles, "What my school can see", per-class sharing toggles, leave school.
2. Planner: calendar change notices; announcement banner; feedback badges on lessons; duties line on days; "Submit plans" in the week view.
3. Lesson editor: comment thread panel (read and reply), never editable by leaders.
4. Publishing pipeline: `schoolPublish.js` (pure) builds tier-1 metadata and tier-2 snapshots from local state; `backend.js` uploads; shadows prevent re-uploads; tests prove private notes and student data never appear in the payload (same style as the bank privacy test).
5. Observations inbox: walkthrough and observation notices, acknowledge and respond.
6. Absence entry, plus "Publish sub plans for this day" from the existing sub packet.
7. All of it hidden when the teacher isn't in a school, so solo teachers see today's app unchanged.

---

## 11. Build order (phases, with acceptance gates)

Each phase ends with: migrations applied, RLS tests for every new table and role, unit tests for every new pure function, a multi-persona browser test against the fake Supabase (extend `fakesupabase.cjs`: principal, coach, two teachers, office), screenshots reviewed at 375, 768 and 1440 px, and a release.

| Phase | Scope | Gate |
| --- | --- | --- |
| **0. Foundations** | Roles as sets + `permissions.js` + SQL helpers; teams; audit log; admin web shell (`admin.html`, routing, sign-in, school switcher); Google sign-in | Permission matrix tests pass in JS and SQL from one table |
| **1. Calendar command center** | Change log and notices, emergency actions on phone, draft/publish, instructional time calculator, events and testing windows | A snow day from a phone reaches teachers; minutes report correct against hand-computed fixtures |
| **2. Plans and feedback** | Plan sharing toggles, submissions with snapshots, submission board, reader with comments, reminders via Edge Function + pg_cron | Privacy payload test; resubmission versions; reminder emails go only to people who haven't submitted |
| **3. Now board and walkthroughs** | `nowAt()`, building board, walkthrough form builder, offline queue, teacher acknowledgement | A walkthrough recorded offline syncs later; teacher sees it once shared and never as a draft |
| **4. Curriculum and coverage** | Pacing guides as banks, pacing status, coverage heat map, team lead scope | Pacing and coverage functions match fixtures; team lead sees only their team |
| **5. Coverage and community** | Absences, coverage board with internal-cover suggestions, sub links, duties, announcements, PLC notes | Coverage suggestions never pick a teacher who's teaching that period |
| **6. Formal observations** | Rubric templates, cycles, evidence scripting, requirement tracking, exports | Coaching notes invisible to leaders (RLS test) |
| **7. Student data (gated)** | OneRoster, MTSS, assessment results | Signed DPA; access logging; deletion API |

Do phases in order; each one stands on its own and is useful, so it can ship to a pilot school.

---

## 12. Testing and quality strategy

- **Pure functions first:** `permissions.js`, `schoolPublish.js`, `nowAt()`, instructional time, pacing status, coverage aggregation, coverage suggestions, calendar diff. Fixtures include A/B, cycle and weekly schedules; leap years; cancelled days with `keep` and `shift`; and early-release day types (all already modeled in `schedule.js`).
- **RLS tests (PGlite):** one matrix test per table: for each role × operation (select, insert, update, delete) assert allowed or denied. Include cross-school attempts and removed members.
- **Seed generator:** `scripts/seed-school.mjs` builds a realistic fake school (45 teachers, 6 grade-level teams, 3 lunches, A/B electives, a semester of plans) for the fake Supabase and for screenshots. No real names, no real student data.
- **Browser tests:** multi-context Playwright like `cloud.cjs` and `schoolflow.cjs`, one browser context per persona.
- **Load:** a 120-teacher school, a full year of plans; the submission board and coverage heat map must render in under 1 second on a school laptop.
- **Security review** before each release: secrets, RPC input validation, rate limits on join codes and invites, signed URLs for media, no `service_role`.

---

## 13. Open questions for the product owner

1. **Pilot:** which school, and who are the first leader, coach and office users? (One school's real workflow beats any spec.)
2. **Who pays and who signs?** A teacher's own app versus a school or district license. Admin features usually need a school-level agreement (and the DPA for phase 7).
3. **Plan expectations:** does your school require weekly plan submission? Due day and time? Which classes?
4. **Evaluation:** which rubric and official platform does your state use? Should the app only do informal walkthroughs and coaching, leaving formal evaluation to the state system? (Recommended for v1.)
5. **Phones:** confirm that leaders want the walkthrough and emergency calendar on phones (this plan assumes yes).
6. **District calendar:** is there a district-level person who should own the calendar for all schools?
7. **Branding:** separate app name and download, or a "School" tab inside Teacher Planner for people with leader roles? (This plan recommends a separate web app sharing one account.)

---

## Appendix A: Reuse map

| Existing file | Admin use |
| --- | --- |
| `src/lib/schedule.js` | Now board, instructional time, coverage suggestions, duties on days |
| `src/lib/calendarPaint.js`, `components/YearCalendar.jsx` | Leader calendar editor (already read-only aware) |
| `src/lib/bells.js`, `components/BellSchedule.jsx` | Bell schedules, multiple bell schedules |
| `src/lib/icsImport.js`, `components/CalendarImport.jsx` | District calendar import; template for the PDF assist review table |
| `src/lib/cloud/schoolSync.js` | School data model, apply and relink, shadows; base for draft/publish and change diffs |
| `src/lib/cloud/sync.js` | Shadow fingerprint push pattern for plan publishing and offline walkthroughs |
| `src/lib/reports.js` | Coverage and achievement math to aggregate |
| `src/lib/standardsCatalog.js` | State standards in pacing and coverage |
| `src/pages/Print.jsx`, `pages/Views.jsx` | Snapshot rendering for submissions and sub packets; admin view preset exists |
| `supabase/migrations/*school_profiles.sql` | Schools, members, join code RPC, `guard_school` trigger pattern |
| `tests/rls.test.js` | RLS test harness to extend per table |
| `fakesupabase.cjs` + `schoolflow.cjs` (scratch test harness) | Multi-persona browser tests; move into the repo under `tests/e2e/` |

## Appendix B: Glossary

- **Tier**: sharing level of a piece of data (section 4.1).
- **Snapshot**: frozen rendered copy of plans at submission, distinct from live plans.
- **Now board**: who is teaching what, where, right now, computed from shared schedules.
- **Walkthrough**: short informal classroom visit record. **Observation**: formal, rubric-based. **Coaching cycle**: non-evaluative support, private to coach and teacher.
- **DPA**: data privacy agreement between a district and a vendor, needed before storing student data.
- **OneRoster**: 1EdTech standard format for rosters exported by student information systems.
