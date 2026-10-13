import { useMemo, useState } from 'react';
import { host, useStore } from '../lib/store.jsx';
import {
  canEdit, effectiveTemplateIds, lessonHome, makeLesson, sectionAccess, standardIndex, standardOptions, templateTextFor, uid,
} from '../lib/model.js';
import { place } from '../lib/sequence.js';
import { copyLesson, findClass } from '../lib/actions.js';
import { formatDate, formatTime } from '../lib/dates.js';
import { ACCOMMODATIONS, ATTACHMENT_TYPES, DIFFERENTIATION, STRATEGIES } from '../data/presets.js';
import { Chip, Field, Modal, MultiPicker } from './ui.jsx';
import { attachmentHref, sectionStyle } from './LessonContent.jsx';

const MAX_FILE = 1.5 * 1024 * 1024;

export function libraryOptions(preset, custom) {
  return [...new Set([...preset, ...(custom || [])])].map((v) => ({ value: v, label: v }));
}

export function AttachmentEditor({ value, onChange, disabled }) {
  const { notify } = useStore();
  const [type, setType] = useState('link');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const add = (att) => { onChange([...value, { id: uid('att'), ...att }]); setName(''); setUrl(''); };
  const onFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const kind = file.type.startsWith('image/') ? 'image' : type === 'link' ? 'file' : type;
    if (host) {
      // Desktop: copy the file into the planner folder's attachments/ (no size limit).
      file.arrayBuffer()
        .then((buf) => host.saveAttachment(file.name, buf))
        .then((path) => add({ type: kind, name: name || file.name, path }))
        .catch(() => notify('Could not copy the file into your planner folder.', true));
      return;
    }
    if (file.size > MAX_FILE) {
      notify('Files over 1.5 MB are too large to store in the browser — upload to Google Drive and attach the link instead.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => add({ type: kind, name: name || file.name, dataUrl: reader.result });
    reader.readAsDataURL(file);
  };
  return (
    <div className="attach-editor">
      {value.map((a) => (
        <div key={a.id} className="attach-row">
          <span className="att-type">{ATTACHMENT_TYPES[a.type]}</span>
          <a href={attachmentHref(a)} target="_blank" rel="noreferrer">{a.name || a.url}</a>
          {!disabled && <button className="icon-btn" onClick={() => onChange(value.filter((x) => x.id !== a.id))} aria-label="Remove attachment">✕</button>}
        </div>
      ))}
      {!disabled && (
        <div className="row wrap">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(ATTACHMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="grow" />
          <button disabled={!url.trim()} onClick={() => add({ type, name: name || url, url: url.trim() })}>Add link</button>
          <label className="btn">Upload file<input type="file" hidden onChange={onFile} /></label>
        </div>
      )}
    </div>
  );
}

/**
 * Edit the lesson at position `index` of class `classId` (scheduled for `date`).
 * Works for owned lessons, lessons linked from shared classes/banks, and empty days.
 */
export default function LessonEditor({ containerId, index, date, meeting, onClose }) {
  const { state, update, notify, userId } = useStore();
  const container = findClass(state, containerId);
  const lessonId = container.sequence[index] || null;
  const existing = lessonId ? state.lessons[lessonId] : null;
  const [draft, setDraft] = useState(() =>
    existing ? structuredClone(existing) : makeLesson({ homeType: state.banks.some((b) => b.id === containerId) ? 'bank' : 'class', homeId: containerId, ownerId: userId }),
  );
  const [subNote, setSubNote] = useState(state.subNotes?.[date]?.[containerId] || '');
  const home = (existing && lessonHome(state, existing)) || container;
  const editable = canEdit(home, userId);
  const linked = existing && existing.homeId !== containerId;
  const uses = existing ? [...state.classes, ...state.banks].reduce((n, c) => n + c.sequence.filter((x) => x === lessonId).length, 0) : 0;

  const stdIndex = useMemo(() => standardIndex(state), [state]);
  const stdOptions = useMemo(() => standardOptions(stdIndex, draft.standardIds), [stdIndex, draft.standardIds]);
  const templates = state.templates;
  const activeTemplateIds = effectiveTemplateIds(container, draft);
  const activeTemplates = templates.filter((t) => activeTemplateIds.includes(t.id));

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setContent = (secId, text) => setDraft((d) => ({ ...d, content: { ...d.content, [secId]: text } }));
  const addToLibrary = (kind) => (v) => update((d) => { d.library[kind] = [...new Set([...(d.library[kind] || []), v])]; });

  const toggleTemplate = (tid) => {
    const fromClass = (container.templateIds || []).includes(tid);
    const on = activeTemplateIds.includes(tid);
    setDraft((d) => {
      let added = (d.addedTemplateIds || []).filter((x) => x !== tid);
      let removed = (d.removedTemplateIds || []).filter((x) => x !== tid);
      if (on && fromClass) removed = [...removed, tid];
      if (!on && !fromClass) added = [...added, tid];
      return { ...d, addedTemplateIds: added, removedTemplateIds: removed };
    });
  };

  const save = () => {
    update((d) => {
      if (existing) {
        const target = d.lessons[existing.id];
        if (editable) {
          const sections = home.sections;
          const content = { ...target.content };
          // Respect per-section permissions for collaborators.
          for (const sec of sections) if (sectionAccess(home, sec.id, userId) === 'edit') content[sec.id] = draft.content[sec.id] || '';
          Object.assign(target, { ...draft, content, privateNotes: { ...target.privateNotes, [userId]: draft.privateNotes?.[userId] || '' }, updatedAt: Date.now() });
        } else {
          target.privateNotes = { ...target.privateNotes, [userId]: draft.privateNotes?.[userId] || '' };
        }
      } else {
        const hasContent = draft.title || Object.values(draft.content).some(Boolean) || draft.attachments.length;
        if (hasContent) {
          d.lessons[draft.id] = { ...draft, updatedAt: Date.now() };
          const c = findClass(d, containerId);
          c.sequence = place(c.sequence, index, draft.id);
        }
      }
      if (date) {
        d.subNotes[date] = { ...(d.subNotes[date] || {}), [containerId]: subNote };
      }
    });
    notify('Lesson saved');
    onClose();
  };

  const detach = () => {
    update((d) => {
      const newId = copyLesson(d, existing.id, containerId, userId);
      const c = findClass(d, containerId);
      c.sequence = place(c.sequence, index, newId);
    });
    notify('Made an editable copy of this lesson for your class');
    onClose();
  };

  const title = `${container.name}${date ? ` · ${formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}` : ''}${meeting?.start ? ` · ${formatTime(meeting.start)}–${formatTime(meeting.end)}` : ''}`;

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          {linked && <button onClick={detach}>Make my own copy</button>}
          <span className="grow" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </>
      }
    >
      {linked && (
        <div className="notice">
          Linked from <strong>{home?.name}</strong>{editable ? '' : ' (view only)'}. {editable ? 'Edits update every class that links this lesson.' : 'You can add private notes visible only to you, or make your own copy.'}
        </div>
      )}
      {uses > 1 && !linked && <div className="notice">This lesson appears on {uses} days (extended or linked). Edits apply to all of them.</div>}

      <div className="editor-grid">
        <div>
          <Field label="Lesson title">
            <input value={draft.title} disabled={!editable} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Introduction to ratios" autoFocus />
          </Field>

          <div className="field">
            <span className="field-label">Status</span>
            <div className="chips">
              {state.statuses.map((s) => (
                <Chip
                  key={s.id}
                  color={s.color}
                  active={draft.statusIds.includes(s.id)}
                  onClick={editable ? () => set({ statusIds: draft.statusIds.includes(s.id) ? draft.statusIds.filter((x) => x !== s.id) : [...draft.statusIds, s.id] }) : undefined}
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          </div>

          {home.sections.filter((s) => !s.hidden).map((sec) => {
            const access = sectionAccess(home, sec.id, userId);
            if (access === 'none') return null;
            const { before, after } = templateTextFor(activeTemplates, sec);
            return (
              <div key={sec.id} className="field">
                <span className="field-label sec-text" style={{ '--sec': sec.color }}>
                  {sec.name} {access === 'view' && <span className="muted small">(view only)</span>}
                </span>
                {before.map((b) => <div key={b.templateId} className="lc-template">{b.text} <span className="muted small">— {b.name}</span></div>)}
                <textarea
                  rows={3}
                  className="sec-text"
                  style={sectionStyle(sec)}
                  value={draft.content[sec.id] || ''}
                  disabled={!editable || access !== 'edit'}
                  onChange={(e) => setContent(sec.id, e.target.value)}
                />
                {after.map((b) => <div key={b.templateId} className="lc-template">{b.text} <span className="muted small">— {b.name}</span></div>)}
              </div>
            );
          })}

          <Field label="Attachments">
            <AttachmentEditor value={draft.attachments} disabled={!editable} onChange={(attachments) => set({ attachments })} />
          </Field>
        </div>

        <div>
          <Field label="Learning standards">
            <MultiPicker options={stdOptions} value={draft.standardIds} disabled={!editable} onChange={(standardIds) => set({ standardIds })} placeholder="Search code or text…" />
          </Field>
          <Field label="Teaching strategies">
            <MultiPicker options={libraryOptions(STRATEGIES, state.library.strategies)} value={draft.strategies} disabled={!editable} onChange={(strategies) => set({ strategies })} allowCustom onAddCustom={addToLibrary('strategies')} />
          </Field>
          <Field label="Differentiation">
            <MultiPicker options={libraryOptions(DIFFERENTIATION, state.library.differentiation)} value={draft.differentiation} disabled={!editable} onChange={(differentiation) => set({ differentiation })} allowCustom onAddCustom={addToLibrary('differentiation')} />
          </Field>
          <Field label="Accommodations">
            <MultiPicker options={libraryOptions(ACCOMMODATIONS, state.library.accommodations)} value={draft.accommodations} disabled={!editable} onChange={(accommodations) => set({ accommodations })} allowCustom onAddCustom={addToLibrary('accommodations')} />
          </Field>

          <div className="field">
            <span className="field-label">Templates</span>
            {templates.length === 0 && <span className="muted small">No templates yet — create them on the Templates page.</span>}
            <div className="chips">
              {templates.map((t) => (
                <Chip key={t.id} active={activeTemplateIds.includes(t.id)} onClick={editable ? () => toggleTemplate(t.id) : undefined}>
                  {t.name}{(container.templateIds || []).includes(t.id) ? ' (class)' : ''}
                </Chip>
              ))}
            </div>
          </div>

          <Field label="My private notes" hint="Only you can see these, even on shared lessons.">
            <textarea rows={3} value={draft.privateNotes?.[userId] || ''} onChange={(e) => set({ privateNotes: { ...draft.privateNotes, [userId]: e.target.value } })} />
          </Field>

          {date && (
            <Field label="Substitute notes for this day" hint="Shown in substitute views.">
              <textarea rows={3} value={subNote} onChange={(e) => setSubNote(e.target.value)} placeholder="Seating, routines, where materials are…" />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}
