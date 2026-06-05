import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { HwpxDocument } from './HwpxDocument';

/**
 * Regression: update_table_cell with single-line text used to replace only the
 * first <hp:t> of a multi-run / multi-paragraph cell, leaving the remaining
 * original runs and paragraphs (e.g. template placeholders {{참석자2}}/{{참석자3}})
 * behind. The bug surfaced only after save() (XML serialization), not in the
 * in-memory model. Multi-line text went through a different, correct path, so it
 * only reproduced when the participant block fit on a single line (one group).
 */
const TEMPLATE = path.join(
  __dirname, '..', '..', 'skills', 'templates', '업무추진비류_집행내역서_서식.hwpx'
);

// The participant cell in the expense template (section 0, table 0, row 4, col 0)
// ships multi-paragraph with styled placeholder runs — the exact shape that
// triggered the bug.
const PARTICIPANT = { section: 0, table: 0, row: 4, col: 0 };

describe('update_table_cell single-line full replace (bug regression)', () => {
  it('replaces the entire participant cell, leaving no stray runs/paragraphs', async () => {
    const buf = fs.readFileSync(TEMPLATE);
    const doc = await HwpxDocument.createFromBuffer('repro', TEMPLATE, buf);

    // Sanity: template cell starts multi-paragraph with placeholders.
    const before = doc.getTableCell(PARTICIPANT.section, PARTICIPANT.table, PARTICIPANT.row, PARTICIPANT.col);
    expect(before).not.toBeNull();
    expect(before!.text).toContain('{{참석자');
    expect(before!.cell.paragraphs.length).toBeGreaterThan(1);

    // Single-line participant block (one group, no newline) — the bug trigger.
    const oneLine = '4. 참  석  자 : 총 4명 (정보전산팀) 김미소, 정인자, 김길동, 홍길동';
    doc.updateTableCell(PARTICIPANT.section, PARTICIPANT.table, PARTICIPANT.row, PARTICIPANT.col, oneLine, 12);

    // The bug only appeared after serialization, so round-trip through save().
    const saved = await doc.save();
    const reloaded = await HwpxDocument.createFromBuffer('reload', TEMPLATE, saved);
    const after = reloaded.getTableCell(PARTICIPANT.section, PARTICIPANT.table, PARTICIPANT.row, PARTICIPANT.col);

    expect(after).not.toBeNull();
    expect(after!.text).toBe(oneLine);
    expect(after!.text).not.toContain('{{');       // no leftover placeholders
    expect(after!.cell.paragraphs.length).toBe(1); // old extra paragraphs cleared
  });

  it('multi-line participant block still round-trips (no regression)', async () => {
    const buf = fs.readFileSync(TEMPLATE);
    const doc = await HwpxDocument.createFromBuffer('repro2', TEMPLATE, buf);

    const multi =
      '4. 참  석  자 : 총 3명 (정보전산팀) 김미소\n' +
      '                        (기획팀) 정인자\n' +
      '                        (외부) 김길동';
    doc.updateTableCell(PARTICIPANT.section, PARTICIPANT.table, PARTICIPANT.row, PARTICIPANT.col, multi, 12);

    const saved = await doc.save();
    const reloaded = await HwpxDocument.createFromBuffer('reload2', TEMPLATE, saved);
    const after = reloaded.getTableCell(PARTICIPANT.section, PARTICIPANT.table, PARTICIPANT.row, PARTICIPANT.col);

    expect(after!.text).toBe(multi);
    expect(after!.text).not.toContain('{{');
    expect(after!.cell.paragraphs.length).toBe(3);
  });
});
