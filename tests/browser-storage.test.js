import { describe, expect, it } from 'vitest';
import { backupReminderDue } from '../src/lib/browserStorage.js';

describe('backup reminder', () => {
  it('waits a week after the first visit', () => {
    expect(backupReminderDue(null, '2026-11-19', null)).toBe(false);
    expect(backupReminderDue(null, '2026-11-25', '2026-11-19')).toBe(false);
    expect(backupReminderDue(null, '2026-11-26', '2026-11-19')).toBe(true);
  });
  it('stays quiet for a month after a backup', () => {
    expect(backupReminderDue('2026-11-01', '2026-11-26', '2026-11-01')).toBe(false);
    expect(backupReminderDue('2026-10-20', '2026-11-26', '2026-11-01')).toBe(true);
  });
  it('reminds at most once a week', () => {
    expect(backupReminderDue(null, '2026-12-01', '2026-11-26')).toBe(false);
  });
});
