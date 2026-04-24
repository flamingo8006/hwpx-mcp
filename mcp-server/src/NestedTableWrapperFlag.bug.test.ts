/**
 * Regression guard for the wrapsTable + isNestedInWrapper flag pair
 * (follow-up to the table-at-top fix landed in bfe0155).
 *
 * Why this exists:
 *   - bfe0155 introduced `HwpxParagraph.wrapsTable` on the wrapper and
 *     relied on "previous mem entry is a wrapsTable paragraph" to decide
 *     whether a table mem-entry should be skipped during mem→walker index
 *     translation.
 *   - Reviewer flagged a latent edge: if a single wrapsTable wrapper ever
 *     contained TWO nested <hp:tbl>s, only the first got skipped (since the
 *     second's prev-entry is the first tbl, not a wrapsTable paragraph).
 *     The second one would leak into walker-space and re-surface the
 *     table-at-top drift.
 *   - The follow-up adds `HwpxTable.isNestedInWrapper` set by the parser for
 *     every tbl physically inside a wrapsTable wrapper, so the walker check
 *     no longer depends on the adjacency heuristic.
 *
 * This test asserts the flag pair is correctly populated against the real
 * DGIST 공문서 frame template (which has nested title + summary boxes —
 * each their own <hp:p> wrapper with one nested <hp:tbl> inside).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HwpxDocument } from './HwpxDocument';
import type { HwpxParagraph, HwpxTable } from './types';

const GONGMUN_FRAME = path.join(
  os.homedir(),
  'Documents',
  'skills',
  'templates',
  '공문서_프레임.hwpx',
);
const hasFrame = fs.existsSync(GONGMUN_FRAME);

describe('wrapsTable / isNestedInWrapper flag propagation', () => {
  const d = hasFrame ? describe : describe.skip;

  d('against real 공문서_프레임.hwpx (DGIST Mode B template)', () => {
    it('wrapper paragraphs get wrapsTable=true AND their nested tables get isNestedInWrapper=true', async () => {
      const buf = fs.readFileSync(GONGMUN_FRAME);
      const doc = await HwpxDocument.createFromBuffer('flag-probe', GONGMUN_FRAME, buf);

      const section = (doc as unknown as {
        _content: { sections: { elements: Array<{ type: string; data: unknown }> }[] };
      })._content.sections[0];
      expect(section, 'section[0] must exist').toBeDefined();

      // Collect wrapsTable wrappers + nested tables.
      const wrappers: number[] = [];
      const nestedTbls: number[] = [];
      const topLevelTbls: number[] = [];

      for (let i = 0; i < section.elements.length; i++) {
        const el = section.elements[i];
        if (el.type === 'paragraph' && (el.data as HwpxParagraph).wrapsTable) {
          wrappers.push(i);
        } else if (el.type === 'table') {
          const tbl = el.data as HwpxTable;
          if (tbl.isNestedInWrapper) nestedTbls.push(i);
          else topLevelTbls.push(i);
        }
      }

      // The frame has at least one wrapsTable wrapper (title box) and a
      // matching nested tbl. If the template is extended with more decorative
      // boxes this count only grows, so use >= 1 rather than an exact number.
      expect(wrappers.length, 'frame must contain at least one wrapsTable wrapper').toBeGreaterThanOrEqual(1);
      expect(nestedTbls.length, 'each wrapsTable wrapper should have ≥1 nested tbl').toBeGreaterThanOrEqual(wrappers.length);

      // Invariant: every nested tbl's nearest preceding non-table entry must
      // be a wrapsTable paragraph (since the parser emits the tbl inside the
      // wrapper's XML range).
      for (const ti of nestedTbls) {
        let j = ti - 1;
        while (j >= 0 && section.elements[j].type === 'table') j--;
        expect(j, `nested tbl at mem[${ti}] must have a preceding non-tbl entry`).toBeGreaterThanOrEqual(0);
        const anchor = section.elements[j];
        expect(anchor.type).toBe('paragraph');
        expect(
          (anchor.data as HwpxParagraph).wrapsTable,
          `nested tbl at mem[${ti}] must be anchored by a wrapsTable paragraph (found mem[${j}])`,
        ).toBe(true);
      }
    });

    it('save→reload round-trip preserves the flag pair', async () => {
      const buf = fs.readFileSync(GONGMUN_FRAME);
      const doc1 = await HwpxDocument.createFromBuffer('flag-probe-rt-1', GONGMUN_FRAME, buf);

      const getFlagCounts = (d: HwpxDocument): { wrappers: number; nested: number } => {
        const section = (d as unknown as {
          _content: { sections: { elements: Array<{ type: string; data: unknown }> }[] };
        })._content.sections[0];
        let wrappers = 0;
        let nested = 0;
        for (const el of section.elements) {
          if (el.type === 'paragraph' && (el.data as HwpxParagraph).wrapsTable) wrappers++;
          if (el.type === 'table' && (el.data as HwpxTable).isNestedInWrapper) nested++;
        }
        return { wrappers, nested };
      };

      const before = getFlagCounts(doc1);
      const saved = await doc1.save();

      const doc2 = await HwpxDocument.createFromBuffer('flag-probe-rt-2', GONGMUN_FRAME, saved);
      const after = getFlagCounts(doc2);

      expect(after.wrappers).toBe(before.wrappers);
      expect(after.nested).toBe(before.nested);
      expect(after.wrappers, 'round-trip must preserve at least one wrapsTable').toBeGreaterThanOrEqual(1);
      expect(after.nested, 'round-trip must preserve at least one nested tbl flag').toBeGreaterThanOrEqual(1);
    });
  });
});
