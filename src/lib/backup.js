import { download } from '../components/ui.jsx';
import { today } from './dates.js';

/** Download the whole planner as a backup file, and remember when. */
export function exportBackup(state, applyRemote) {
  download(`teacher-planner-backup-${today()}.json`, JSON.stringify(state), 'application/json');
  applyRemote((d) => { d.lastBackup = today(); }, { history: false });
}
