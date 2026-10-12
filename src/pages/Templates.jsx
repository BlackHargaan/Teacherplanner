import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canEdit, makeTemplate, standardIndex, yearClasses } from '../lib/model.js';
import { STRATEGIES } from '../data/presets.js';
import { AttachmentEditor, libraryOptions } from '../components/LessonEditor.jsx';
import { Empty, Field, MultiPicker } from '../components/ui.jsx';

export default function Templates() {
  const { state, update, userId, year, notify } = useStore();
  const [selected, setSelected] = useState(state.templates[0]?.id);
  const tpl = state.templates.find((t) => t.id === selected);
  const edit = (fn) => update((d) => fn(d.templates.find((t) => t.id === selected)));
  const classes = yearClasses(state, year.id).filter((c) => canEdit(c, userId));
  const sectionNames = useMemo(() => {
    const names = new Set();
    for (const c of [...state.classes, ...state.banks]) for (const s of c.sections) names.add(s.name);
    for (const t of state.templates) for (const k of Object.keys(t.content || {})) names.add(k);
    return [...names];
  }, [state.classes, state.banks, state.templates]);
  const [newSection, setNewSection] = useState('');
  const stdOptions = useMemo(() => Object.values(standardIndex(state)).map((s) => ({ value: s.id, label: s.code, sub: s.description })), [state]);

  const add = () => {
    const t = makeTemplate({ ownerId: userId, name: `Template ${state.templates.length + 1}` });
    update((d) => { d.templates.push(t); });
    setSelected(t.id);
  };

  const usedSections = tpl ? Object.keys(tpl.content) : [];

  return (
    <div className="page split">
      <aside className="side-list">
        <div className="row"><h1 className="grow">Templates</h1><button className="primary" onClick={add}>+ Template</button></div>
        {state.templates.map((t) => (
          <button key={t.id} className={`side-item ${t.id === selected ? 'on' : ''}`} onClick={() => setSelected(t.id)}>{t.name}</button>
        ))}
        {state.templates.length === 0 && <Empty>Templates add outlines or repeating activities (bell ringers, exit tickets…) to lessons automatically.</Empty>}
      </aside>
      {tpl ? (
        <section className="detail">
          <div className="card">
            <Field label="Template name"><input value={tpl.name} onChange={(e) => edit((t) => { t.name = e.target.value; })} /></Field>
            <Field label="Placement">
              <select value={tpl.position} onChange={(e) => edit((t) => { t.position = e.target.value; })}>
                <option value="prepend">Before lesson content</option>
                <option value="append">After lesson content</option>
              </select>
            </Field>
            <h3>Section content</h3>
            <p className="small muted">Content is matched to lesson sections by name, so one template works across classes with different layouts.</p>
            {usedSections.map((name) => (
              <Field key={name} label={name}>
                <div className="row">
                  <textarea className="grow" rows={2} value={tpl.content[name]} onChange={(e) => edit((t) => { t.content[name] = e.target.value; })} />
                  <button className="icon-btn" onClick={() => edit((t) => { delete t.content[name]; })}>✕</button>
                </div>
              </Field>
            ))}
            <div className="row">
              <input list="section-names" placeholder="Section name" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
              <datalist id="section-names">{sectionNames.filter((n) => !usedSections.includes(n)).map((n) => <option key={n} value={n} />)}</datalist>
              <button disabled={!newSection.trim()} onClick={() => { edit((t) => { t.content[newSection.trim()] = t.content[newSection.trim()] || ''; }); setNewSection(''); }}>+ Add section content</button>
            </div>
          </div>
          <div className="card">
            <Field label="Standards"><MultiPicker options={stdOptions} value={tpl.standardIds} onChange={(v) => edit((t) => { t.standardIds = v; })} /></Field>
            <Field label="Strategies"><MultiPicker options={libraryOptions(STRATEGIES, state.library.strategies)} value={tpl.strategies} onChange={(v) => edit((t) => { t.strategies = v; })} /></Field>
            <Field label="Attachments"><AttachmentEditor value={tpl.attachments} onChange={(v) => edit((t) => { t.attachments = v; })} /></Field>
          </div>
          <div className="card">
            <h3>Apply to classes</h3>
            {classes.map((c) => (
              <label key={c.id} className="row">
                <input type="checkbox" checked={c.templateIds.includes(tpl.id)} onChange={(e) => update((d) => {
                  const cc = d.classes.find((x) => x.id === c.id);
                  cc.templateIds = e.target.checked ? [...cc.templateIds, tpl.id] : cc.templateIds.filter((x) => x !== tpl.id);
                })} />
                <span className="dot" style={{ background: c.color }} /> {c.name}
              </label>
            ))}
            <button className="danger" onClick={() => {
              if (!window.confirm('Delete this template? It will be removed from all lessons.')) return;
              update((d) => {
                d.templates = d.templates.filter((t) => t.id !== tpl.id);
                for (const c of d.classes) c.templateIds = c.templateIds.filter((x) => x !== tpl.id);
                for (const l of Object.values(d.lessons)) {
                  l.addedTemplateIds = (l.addedTemplateIds || []).filter((x) => x !== tpl.id);
                  l.removedTemplateIds = (l.removedTemplateIds || []).filter((x) => x !== tpl.id);
                }
              });
              setSelected(null);
              notify('Template deleted', { undo: true });
            }}>Delete template</button>
          </div>
        </section>
      ) : <section className="detail"><Empty>Select or create a template.</Empty></section>}
    </div>
  );
}
