// Guided tours: a highlighted part of the screen with a short explanation
// next to it, one step at a time. This file is the content plus the pure
// rules for when to offer a tour; components/Tour.jsx draws them.
//
// A step: { route?, target?, title, body, optional? }
//   route   the page the step is on (the tour goes there first)
//   target  CSS selector(s) for what to highlight; the first one that's on
//           screen wins. No target, or none found: the box sits in the middle.
//   optional  skip the step when its target isn't there (e.g. no lessons yet)
//
// Progress is kept per teacher: user.tutorial = { seen: { [tourId]: 'done' |
// 'skipped' }, tips: false when page tours shouldn't be offered }.

const NAV = ['#main-nav', '.nav-toggle'];

export const TOURS = {
  start: {
    title: 'Getting started',
    steps: [
      {
        title: 'Welcome to Teacher Planner',
        body: 'This quick tour shows you where everything is. It takes about two minutes, and you can leave it any time.',
      },
      {
        target: NAV,
        title: 'Your pages',
        body: 'Everything lives in these pages. You’ll spend most of your time in the Planner. The rest is set up once and then mostly left alone.',
      },
      {
        route: 'planner',
        target: '.planner .toolbar',
        title: 'The Planner',
        body: 'See your week, a single day, or one class’s lessons in order. The arrows and Today move through the year, and the class buttons show or hide classes.',
      },
      {
        route: 'planner',
        target: '.week-grid .meeting',
        optional: true,
        title: 'Lessons flow onto your schedule',
        body: 'Each class’s lessons are kept in order and land on the days that class meets. Click a lesson to open it. Drag it to another day to move it, or onto another class to copy it.',
      },
      {
        route: 'planner',
        target: '.day-head .menu',
        optional: true,
        title: 'When a day changes',
        body: 'Snow day? Assembly? Use a day’s ⋯ menu to cancel it or give it a different schedule. Every later lesson shifts for you, so nothing gets lost.',
      },
      {
        route: 'setup',
        target: '[data-tour="calendar"]',
        title: 'Set up your school year',
        body: 'On the Schedule page, enter your first and last day, your school days and your days off. You can import your district calendar, or join your school’s profile if a colleague shared one.',
      },
      {
        route: 'classes',
        target: '.side-list',
        title: 'Add your classes',
        body: 'Add each class you teach and when it meets. If your school uses a bell schedule, choose the period instead of typing times.',
      },
      {
        target: '#global-search',
        title: 'Find any lesson',
        body: 'Search every lesson from every year. Press Ctrl+K (⌘K on a Mac) to jump here from anywhere.',
      },
      {
        title: 'Undo anything',
        body: 'Made a mistake? Ctrl+Z (⌘Z on a Mac) undoes it, and many changes show an Undo button too. The desktop app also keeps a daily backup.',
      },
      {
        target: '.help-menu',
        title: 'Help is always here',
        body: 'Open this ? menu to take this tour again or get a tour of the page you’re on. That’s it. Enjoy planning!',
      },
    ],
  },

  planner: {
    title: 'The Planner',
    steps: [
      { route: 'planner', target: '.planner .toolbar .tabs', title: 'Three ways to look', body: 'Week shows every class side by side, Day shows one day in more room, and Class list shows one class’s lessons in order, where you can reorder them.' },
      { route: 'planner', target: '.planner .toolbar .class-toggle', optional: true, title: 'Show or hide classes', body: 'Click a class to hide it for now, for example to focus on one subject. Details shows more of each lesson.' },
      { route: 'planner', target: '.week-grid .meeting', optional: true, title: 'A lesson', body: 'Click to open and edit it. Drag it to another day to move it, or onto another class to copy it. Its ⋯ menu can bump, extend or remove it.' },
      { route: 'planner', target: '.day-head .menu', optional: true, title: 'Day menu', body: 'Cancel the day, switch it to an alternate schedule (early release, assembly…), add an extra class, or print sub plans for it.' },
      { route: 'planner', target: '.print-menu', title: 'Print or PDF', body: 'Make weekly lesson plans or a full sub plan packet as a PDF.' },
    ],
  },

  setup: {
    title: 'Schedule',
    steps: [
      { route: 'setup', target: '.school-card', optional: true, title: 'School profile', body: 'One teacher sets up the school calendar and bell schedule and shares it with a join code. Everyone who joins gets it, kept up to date.' },
      { route: 'setup', target: '[data-tour="calendar"]', title: 'The school year', body: 'First and last day, which weekdays have school, and whether your school runs a weekly schedule or an A/B or rotating day schedule.' },
      { route: 'setup', target: ['[data-tour="year-calendar"] .yearcal-tools', '[data-tour="year-calendar"]'], title: 'Paint the calendar', body: 'Pick a brush, such as No school or Teacher workday, then click or drag across days. Or import your district’s calendar file.' },
      { route: 'setup', target: '[data-tour="bells"]', title: 'Bell schedule', body: 'Enter your periods once, then put each class in its period. Change a bell time later and every class in that period moves with it.' },
      { route: 'setup', target: '[data-tour="alt-days"]', title: 'Alternate days', body: 'Early release, two-hour delay, assembly schedule: set the times once, then use them on any day from the Planner.' },
      { route: 'setup', target: '[data-tour="grading"]', title: 'Grading periods', body: 'Quarters, trimesters or semesters. The gradebook and reports can then show one grading period at a time.' },
    ],
  },

  classes: {
    title: 'Classes',
    steps: [
      { route: 'classes', target: '.side-list', title: 'Your classes', body: 'Every class this school year. Use + Class to add one, then pick it to change it.' },
      { route: 'classes', target: '.detail .tabs', optional: true, title: 'Everything about a class', body: 'General has its name, room and color. Meeting times says when it meets. Lesson sections sets how its lessons are laid out. Roster holds your students.' },
    ],
  },

  templates: {
    title: 'Templates',
    steps: [
      { route: 'templates', target: '.side-list', title: 'Templates', body: 'Things you write in every lesson, like a bell ringer, an exit ticket or the daily agenda. Write it once here.' },
      { route: 'templates', target: '.detail', optional: true, title: 'Where it goes', body: 'Choose whether it comes before or after the lesson’s own content. Then turn it on for a class under Classes → Templates.' },
    ],
  },

  collaborate: {
    title: 'Collaborate',
    steps: [
      { route: 'collaborate', target: '.side-list', title: 'Team lesson banks', body: 'A bank is a set of lessons for a unit or course that teammates build together. Use + Bank to start one.' },
      { route: 'collaborate', target: '.detail', title: 'Use a bank in your class', body: 'Link a bank’s lessons into your class starting on any date. They stay in sync with the bank, but your schedule is still yours to change.' },
      { target: '.cloud-pill', optional: true, title: 'Share online', body: 'Sign in with your school email to share a bank with teammates on their own computers. Your private notes and student information stay on yours.' },
    ],
  },

  standards: {
    title: 'Standards',
    steps: [
      { route: 'standards', target: '.page .tabs', title: 'Standards and reports', body: 'Browse standards, see which ones you’ve taught (Coverage report), and track student mastery.' },
      { route: 'standards', target: '.side-list .primary', optional: true, title: 'Add your state’s standards', body: 'Choose your state, subject and grades. All 50 states and D.C. are available, or import your own as a spreadsheet (CSV).' },
    ],
  },

  views: {
    title: 'Shared Views',
    steps: [
      { route: 'views', target: '.side-list', title: 'Who it’s for', body: 'Make a view for students, families, a substitute, your team or your principal, and choose exactly what they see.' },
      { route: 'views', target: '[data-tour="view-open"]', optional: true, title: 'Open or send it', body: 'Open view shows a read-only page, for example on a sub’s laptop. Download page saves a file you can email or post to your LMS.' },
    ],
  },

  gradebook: {
    title: 'Gradebook',
    steps: [
      { route: 'gradebook', target: '.page-head .row', title: 'Pick a class', body: 'Choose the class and grading period, add assignments, or export everything to a spreadsheet.' },
      { route: 'gradebook', target: '[data-tour="categories"]', title: 'Categories and weights', body: 'For example Tests 50%, Classwork 30%, Homework 20%. Averages use these weights.' },
      { route: 'gradebook', target: '[data-tour="grades"]', optional: true, title: 'Enter scores', body: 'Type a score in each cell. Blank cells, and notes like ABS or EX, don’t count. Click a student’s name for their report.' },
    ],
  },

  seating: {
    title: 'Seating Charts',
    steps: [
      { route: 'seating', target: '.page-head .row', title: 'Charts for each class', body: 'Pick a class, keep several layouts (for testing, groups…), and print them.' },
      { route: 'seating', target: '[data-tour="seat-layout"]', optional: true, title: 'Arrange the room', body: 'Set rows and columns, turn on Edit layout to add or remove desks, then drag students into seats, or fill them at random or in alphabetical order.' },
    ],
  },

  google: {
    title: 'Google',
    steps: [
      { route: 'google', target: '[data-tour="gcal"]', title: 'Google Calendar', body: 'Download your classes and lessons as a calendar file to add to Google Calendar.' },
      { route: 'google', target: '[data-tour="classroom"]', title: 'Classroom and Drive', body: 'Share a lesson’s attachments to Google Classroom, and attach Google Drive files to lessons.' },
    ],
  },

  settings: {
    title: 'Settings',
    steps: [
      { route: 'settings', target: '[data-tour="appearance"]', title: 'Make it yours', body: 'Choose a color theme and light or dark mode.' },
      { route: 'settings', target: '#account', optional: true, title: 'Online account', body: 'Sign in to share lesson banks and your school’s schedule with colleagues.' },
      { route: 'settings', target: '[data-tour="data"]', optional: true, title: 'Your data', body: 'See where your planner is saved, back it up, or restore an earlier day’s copy.' },
    ],
  },
};

/** The page tour for a route, if there is one. */
export const pageTourFor = (route) => (route && route !== 'start' && TOURS[route] ? route : null);

const progress = (user) => user?.tutorial || {};

/** Offer the getting-started tour? Only until it's been taken or skipped once. */
export const shouldOfferStart = (user) => !progress(user).seen?.start;

/**
 * Offer a page's tour the first time the teacher opens it: not before the
 * getting-started tour was seen, not if page tips are turned off, and only once.
 */
export function shouldOfferPage(user, route) {
  const id = pageTourFor(route);
  const p = progress(user);
  return Boolean(id && p.seen?.start && p.tips !== false && !p.seen?.[id]);
}

/** Record that a tour was finished or dismissed (mutates the user). */
export function markTour(user, tourId, how = 'done') {
  user.tutorial ||= {};
  user.tutorial.seen = { ...(user.tutorial.seen || {}), [tourId]: how };
}

/** Turn page-tour offers on or off (mutates the user). */
export function setTips(user, on) {
  user.tutorial ||= {};
  user.tutorial.tips = on;
}

/** Forget which page tours were seen, so each is offered again. */
export function resetPageTours(user) {
  user.tutorial ||= {};
  user.tutorial.seen = user.tutorial.seen?.start ? { start: user.tutorial.seen.start } : {};
  user.tutorial.tips = true;
}

/**
 * Where to put the explanation box next to a highlighted rectangle, inside a
 * viewport of `vw` × `vh`: below if it fits, otherwise above, otherwise to the
 * right or left, otherwise centered. Returns { top, left, placement }.
 */
export function placeBox(rect, box, vw, vh, gap = 12, margin = 12) {
  const clampX = (x) => Math.max(margin, Math.min(x, vw - box.width - margin));
  const clampY = (y) => Math.max(margin, Math.min(y, vh - box.height - margin));
  if (!rect) return { top: clampY((vh - box.height) / 2), left: clampX((vw - box.width) / 2), placement: 'center' };
  const centerX = clampX(rect.left + rect.width / 2 - box.width / 2);
  const centerY = clampY(rect.top + rect.height / 2 - box.height / 2);
  if (rect.bottom + gap + box.height + margin <= vh) return { top: rect.bottom + gap, left: centerX, placement: 'bottom' };
  if (rect.top - gap - box.height - margin >= 0) return { top: rect.top - gap - box.height, left: centerX, placement: 'top' };
  if (rect.right + gap + box.width + margin <= vw) return { top: centerY, left: rect.right + gap, placement: 'right' };
  if (rect.left - gap - box.width - margin >= 0) return { top: centerY, left: rect.left - gap - box.width, placement: 'left' };
  // Taller than the window (e.g. a whole card): overlap its bottom edge.
  return { top: clampY(vh - box.height - margin), left: centerX, placement: 'inside' };
}
