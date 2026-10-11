export const LESSON_LAYOUTS = [
  { id: 'standard', name: 'Standard', sections: ['Objectives', 'Warm-Up', 'Instruction', 'Guided Practice', 'Independent Practice', 'Assessment', 'Homework'] },
  { id: '5e', name: '5E Model', sections: ['Engage', 'Explore', 'Explain', 'Elaborate', 'Evaluate'] },
  { id: 'hunter', name: 'Madeline Hunter', sections: ['Objective', 'Anticipatory Set', 'Input / Modeling', 'Check for Understanding', 'Guided Practice', 'Independent Practice', 'Closure'] },
  { id: 'gradual', name: 'Gradual Release', sections: ['Learning Target', 'I Do', 'We Do', 'You Do Together', 'You Do Alone', 'Reflection'] },
  { id: 'workshop', name: 'Workshop', sections: ['Mini-Lesson', 'Work Time', 'Conferring', 'Share', 'Homework'] },
  { id: 'ubd', name: 'Understanding by Design', sections: ['Desired Results', 'Essential Questions', 'Evidence', 'Learning Plan', 'Reflection'] },
  { id: 'simple', name: 'Simple', sections: ['Lesson', 'Homework', 'Notes'] },
];

export const MAX_SECTIONS = 10;

export const SECTION_COLORS = ['#334155', '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#9333ea'];

export const CLASS_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'];

export const FONTS = [
  { value: 'inherit', label: 'Default' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet' },
  { value: '"Comic Sans MS", "Comic Neue", cursive', label: 'Comic' },
  { value: '"Courier New", monospace', label: 'Courier' },
];

export const FONT_SIZES = [
  { value: '0.8rem', label: 'Small' },
  { value: '0.9rem', label: 'Normal' },
  { value: '1rem', label: 'Medium' },
  { value: '1.15rem', label: 'Large' },
];

export const DEFAULT_STATUSES = [
  { id: 'st-draft', name: 'Draft', color: '#94a3b8' },
  { id: 'st-ready', name: 'Ready', color: '#16a34a' },
  { id: 'st-review', name: 'Needs Review', color: '#f59e0b' },
  { id: 'st-approved', name: 'Approved', color: '#2563eb' },
  { id: 'st-taught', name: 'Taught', color: '#7c3aed' },
];

export const DEFAULT_SCALE = [
  { value: 4, label: 'Exceeds', color: '#16a34a' },
  { value: 3, label: 'Meets', color: '#2563eb' },
  { value: 2, label: 'Approaching', color: '#f59e0b' },
  { value: 1, label: 'Beginning', color: '#dc2626' },
];

export const STRATEGIES = [
  'Think-Pair-Share', 'Jigsaw', 'Gallery Walk', 'Exit Ticket', 'Socratic Seminar', 'Graphic Organizers',
  'I Do / We Do / You Do', 'Cooperative Learning', 'Inquiry-Based Learning', 'Direct Instruction',
  'Turn and Talk', 'Four Corners', 'Reciprocal Teaching', 'Concept Mapping', 'Project-Based Learning',
  'Flipped Classroom', 'Station Rotation', 'Close Reading', 'Number Talks', 'Interactive Notebooks',
];

export const DIFFERENTIATION = [
  'Tiered assignments', 'Flexible grouping', 'Learning stations', 'Choice boards', 'Scaffolded notes',
  'Extension activities', 'Leveled texts', 'Curriculum compacting', 'Small-group reteach',
  'Sentence frames', 'Manipulatives', 'Anchor charts', 'Peer tutoring', 'Independent study contracts',
];

export const ACCOMMODATIONS = [
  'Extended time', 'Preferential seating', 'Read aloud / oral administration', 'Reduced assignments',
  'Visual supports', 'Frequent breaks', 'Copy of notes', 'Use of calculator', 'Small-group testing',
  'Chunked directions', 'Text-to-speech', 'Bilingual dictionary', 'Speech-to-text', 'Graphic organizers',
  'Check for understanding', 'Large print',
];

export const ATTACHMENT_TYPES = {
  link: 'Link',
  video: 'Video',
  image: 'Image',
  file: 'File',
  drive: 'Google Drive',
  assignment: 'Assignment',
  assessment: 'Assessment',
};

export const VIEW_AUDIENCES = {
  student: 'Students',
  parent: 'Parents / Guardians',
  substitute: 'Substitute',
  team: 'Teacher Team',
  admin: 'Administrator',
};
