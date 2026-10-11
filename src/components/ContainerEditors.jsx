import { useStore } from '../lib/store.jsx';
import { makeSections } from '../lib/model.js';
import { FONTS, FONT_SIZES, LESSON_LAYOUTS, MAX_SECTIONS, SECTION_COLORS } from '../data/presets.js';

/** Edits lesson sections for a class or bank. `edit(fn)` mutates the container draft. */
export function SectionsEditor({ container, edit }) {
  const sections = container.sections;
  const setSec = (id, patch) => edit((c) => Object.assign(c.sections.find((s) => s.id === id), patch));
  const moveSec = (i, dir) => edit((c) => {
    const j = i + dir;
    if (j < 0 || j >= c.sections.length) return;
    [c.sections[i], c.sections[j]] = [c.sections[j], c.sections[i]];
  });
  const applyLayout = (layoutId) => {
    const layout = LESSON_LAYOUTS.find((l) => l.id === layoutId);
    if (!layout) return;
    if (!window.confirm(`Replace sections with the “${layout.name}” layout? Existing section content is matched by name; unmatched sections are kept hidden so nothing is lost.`)) return;
    edit((c) => {
      const fresh = makeSections(layout.sections);
      const kept = [];
      for (const f of fresh) {
        const old = c.sections.find((s) => s.name.toLowerCase() === f.name.toLowerCase());
        kept.push(old ? { ...old, hidden: false } : f);
      }
      const leftovers = c.sections.filter((s) => !kept.includes(s)).map((s) => ({ ...s, hidden: true }));
      c.sections = [...kept, ...leftovers].slice(0, Math.max(MAX_SECTIONS, kept.length));
    });
  };
  return (
    <div>
      <div className="row wrap">
        <span className="small">Preset layout:</span>
        <select value="" onChange={(e) => applyLayout(e.target.value)}>
          <option value="">Choose…</option>
          {LESSON_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.sections.length})</option>)}
        </select>
        <span className="muted small">{sections.length}/{MAX_SECTIONS} sections</span>
      </div>
      <table className="table compact">
        <thead><tr><th /><th>Section</th><th>Color</th><th>Font</th><th>Size</th><th>Bold</th><th>Show</th><th /></tr></thead>
        <tbody>
          {sections.map((s, i) => (
            <tr key={s.id}>
              <td className="nowrap">
                <button className="icon-btn" onClick={() => moveSec(i, -1)} disabled={i === 0} aria-label="Up">↑</button>
                <button className="icon-btn" onClick={() => moveSec(i, 1)} disabled={i === sections.length - 1} aria-label="Down">↓</button>
              </td>
              <td><input value={s.name} onChange={(e) => setSec(s.id, { name: e.target.value })} /></td>
              <td><input type="color" value={s.color} onChange={(e) => setSec(s.id, { color: e.target.value })} /></td>
              <td>
                <select value={s.font} onChange={(e) => setSec(s.id, { font: e.target.value })}>
                  {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  {!FONTS.some((f) => f.value === s.font) && <option value={s.font}>{s.font}</option>}
                </select>
                <input className="mini" placeholder="custom font" title="Any installed font name, e.g. Lexend" onBlur={(e) => e.target.value && setSec(s.id, { font: e.target.value })} />
              </td>
              <td>
                <select value={s.size} onChange={(e) => setSec(s.id, { size: e.target.value })}>
                  {FONT_SIZES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </td>
              <td><input type="checkbox" checked={s.bold} onChange={(e) => setSec(s.id, { bold: e.target.checked })} /></td>
              <td><input type="checkbox" checked={!s.hidden} onChange={(e) => setSec(s.id, { hidden: !e.target.checked })} /></td>
              <td>
                <button className="icon-btn" aria-label="Delete section" onClick={() => {
                  if (window.confirm(`Delete section “${s.name}”? Its content will no longer be shown (hide it instead to keep content).`)) edit((c) => { c.sections = c.sections.filter((x) => x.id !== s.id); });
                }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button disabled={sections.length >= MAX_SECTIONS} onClick={() => edit((c) => { c.sections.push({ ...makeSections(['New Section'])[0], color: SECTION_COLORS[c.sections.length % SECTION_COLORS.length] }); })}>
        + Add section
      </button>
    </div>
  );
}

/** Who can view / edit the container, and per-section overrides. */
export function SharingEditor({ container, edit }) {
  const { state, userId } = useStore();
  const isOwner = container.ownerId === userId;
  const others = state.users.filter((u) => u.id !== container.ownerId);
  const owner = state.users.find((u) => u.id === container.ownerId);
  if (!isOwner) {
    return <p className="small">Owned by <strong>{owner?.name}</strong>. Only the owner can change sharing. Your access: <strong>{container.sharing?.[userId] || 'none'}</strong>.</p>;
  }
  const setRole = (uid, role) => edit((c) => {
    c.sharing = { ...c.sharing };
    if (role) c.sharing[uid] = role; else delete c.sharing[uid];
  });
  const setSecPerm = (secId, uid, val) => edit((c) => {
    c.sectionPermissions = { ...c.sectionPermissions, [secId]: { ...(c.sectionPermissions?.[secId] || {}) } };
    if (val) c.sectionPermissions[secId][uid] = val; else delete c.sectionPermissions[secId][uid];
  });
  const shared = others.filter((u) => container.sharing?.[u.id]);
  return (
    <div>
      {others.length === 0 && <p className="small muted">Add colleagues under <a href="#/settings">Settings → Team members</a> to share.</p>}
      <table className="table compact">
        <thead><tr><th>Teacher</th><th>Access</th></tr></thead>
        <tbody>
          {others.map((u) => (
            <tr key={u.id}>
              <td>{u.name} <span className="muted small">{u.email}</span></td>
              <td>
                <select value={container.sharing?.[u.id] || ''} onChange={(e) => setRole(u.id, e.target.value)}>
                  <option value="">No access</option>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shared.length > 0 && (
        <>
          <h3>Section permissions</h3>
          <p className="small muted">Override access for individual lesson sections (e.g. let a co-teacher edit only “Differentiation”).</p>
          <table className="table compact">
            <thead><tr><th>Section</th>{shared.map((u) => <th key={u.id}>{u.name}</th>)}</tr></thead>
            <tbody>
              {container.sections.map((s) => (
                <tr key={s.id}>
                  <td style={{ color: s.color }}>{s.name}</td>
                  {shared.map((u) => (
                    <td key={u.id}>
                      <select value={container.sectionPermissions?.[s.id]?.[u.id] || ''} onChange={(e) => setSecPerm(s.id, u.id, e.target.value)}>
                        <option value="">Default ({container.sharing[u.id]})</option>
                        <option value="none">Hidden</option>
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
