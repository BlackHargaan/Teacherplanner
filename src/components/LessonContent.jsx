import { useStore } from '../lib/store.jsx';
import { effectiveTemplateIds, lessonHome, sectionAccess, standardIndex, templateTextFor } from '../lib/model.js';
import { ATTACHMENT_TYPES } from '../data/presets.js';
import { Chip } from './ui.jsx';
import { useMemo } from 'react';

export function StatusChips({ ids }) {
  const { state } = useStore();
  return (
    <>
      {(ids || []).map((id) => {
        const st = state.statuses.find((s) => s.id === id);
        return st ? <Chip key={id} color={st.color}>{st.name}</Chip> : null;
      })}
    </>
  );
}

export function sectionStyle(sec) {
  return { color: sec.color, fontFamily: sec.font, fontSize: sec.size, fontWeight: sec.bold ? 700 : undefined };
}

/**
 * Read-only rendering of a lesson as seen from a class.
 * opts: { sectionNames (filter), showAttachments, showStandards, compact, userId, privateNotes }
 */
export function LessonContent({ lesson, cls, opts = {} }) {
  const { state } = useStore();
  const home = lessonHome(state, lesson) || cls;
  const templates = state.templates.filter((t) => effectiveTemplateIds(cls, lesson).includes(t.id));
  const std = useMemo(() => (opts.showStandards ? standardIndex(state) : {}), [state, opts.showStandards]);
  const userId = opts.userId;
  const sections = (home?.sections || []).filter((s) => !s.hidden)
    .filter((s) => !opts.sectionNames || opts.sectionNames.includes(s.name))
    .filter((s) => !userId || sectionAccess(home, s.id, userId) !== 'none' || !opts.enforceAccess);

  const blocks = sections.map((sec) => {
    const { before, after } = templateTextFor(templates, sec);
    const text = lesson?.content?.[sec.id];
    if (!text && !before.length && !after.length) return null;
    return (
      <div key={sec.id} className="lc-section">
        <div className="lc-sec-name" style={{ color: sec.color }}>{sec.name}</div>
        <div className="lc-sec-body" style={sectionStyle(sec)}>
          {before.map((b) => <div key={b.templateId} className="lc-template" title={`From template: ${b.name}`}>{b.text}</div>)}
          {text && <div className="pre">{text}</div>}
          {after.map((b) => <div key={b.templateId} className="lc-template" title={`From template: ${b.name}`}>{b.text}</div>)}
        </div>
      </div>
    );
  }).filter(Boolean);

  const attachments = opts.showAttachments
    ? [...(lesson?.attachments || []), ...templates.flatMap((t) => t.attachments || [])]
    : [];
  const standards = opts.showStandards
    ? [...new Set([...(lesson?.standardIds || []), ...templates.flatMap((t) => t.standardIds || [])])]
    : [];

  return (
    <div className={`lesson-content ${opts.compact ? 'compact' : ''}`}>
      {blocks.length ? blocks : <div className="muted small">No lesson details.</div>}
      {attachments.length > 0 && (
        <div className="lc-attachments">
          {attachments.map((a) => <AttachmentLink key={a.id} a={a} />)}
        </div>
      )}
      {standards.length > 0 && (
        <div className="lc-standards">
          {standards.map((id) => (
            <div key={id} className="small"><strong>{std[id]?.code || id}</strong> {std[id]?.description}</div>
          ))}
        </div>
      )}
      {opts.privateNote && <div className="lc-private"><strong>My notes:</strong> <span className="pre">{opts.privateNote}</span></div>}
    </div>
  );
}

/** Files stored in the desktop planner folder are served through vault:// */
export function attachmentHref(a) {
  if (a.path) return `vault://file/${a.path.split('/').map(encodeURIComponent).join('/')}`;
  return a.dataUrl || a.url;
}

export function AttachmentLink({ a }) {
  const href = attachmentHref(a);
  const isImage = a.type === 'image' && href;
  return (
    <a className="attachment" href={href} target="_blank" rel="noreferrer" download={a.dataUrl ? a.name : undefined}>
      <span className="att-type">{ATTACHMENT_TYPES[a.type] || 'Link'}</span>
      {isImage ? <img src={href} alt={a.name} /> : null}
      <span>{a.name || href}</span>
    </a>
  );
}
