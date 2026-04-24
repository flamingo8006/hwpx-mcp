/**
 * Regression test for the "table-at-top" bug (2026-04-24).
 *
 * Scenario that used to fail:
 *   - Template has nested decorative <hp:tbl>s wrapped inside <hp:p> wrappers
 *     (DGIST 공문서_프레임.hwpx title + summary boxes).
 *   - Mode B body is appended: heading → point → table_title → TABLE_A →
 *     note → heading → TABLE_B.
 *   - At save time the old pipeline ran paragraph inserts and table inserts
 *     in two separate passes, and the XML walker counted top-level <hp:p>/
 *     <hp:tbl> while the parser emitted the nested tbl as a separate mem
 *     entry. The mem-space → walker-space gap made both tables resolve to
 *     a "past end" walker target that fell back to the end-of-section
 *     marker, where they landed *before* any of the not-yet-applied body
 *     paragraphs were inserted. Result: both tables drifted to the top of
 *     the document instead of sitting inside their sections.
 *
 * The fix is a unified apply pass (`applyPendingInsertsToXml`) that sorts
 * queued inserts by shared `insertOrder` and translates positions through
 * `computeWalkerTargetIndex`, which skips both nested-table mem entries
 * and pending-not-yet-applied entries.
 *
 * This test guards the positional invariant:
 *   - TABLE_A must appear AFTER "TBL_TITLE_ALPHA" in the saved XML.
 *   - TABLE_B must appear AFTER "HDG_BETA" in the saved XML.
 *   - The interleaved markers preserve insert order.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import JSZip from 'jszip';
import { HwpxDocument } from './HwpxDocument';

const GONGMUN = path.join(
  os.homedir(),
  'Documents',
  'skills',
  'templates',
  '공문서_프레임.hwpx',
);
const hasGongmun = fs.existsSync(GONGMUN);

describe('Interleaved paragraph+table insert on top of nested decorative tables', () => {
  const d = hasGongmun ? describe : describe.skip;

  d('against real 공문서_프레임.hwpx (Mode B style-palette frame)', () => {
    it('queued tables land after their anchor paragraphs, not drifted to the top', async () => {
      const buf = fs.readFileSync(GONGMUN);
      const doc = await HwpxDocument.createFromBuffer('bug-nested-tbl', GONGMUN, buf);

      // Frame has nested tables (title + summary) — cannot assume a specific
      // element count here; just append at the end.
      let idx = doc.getElementCount(0) - 1;

      // Use unique marker tokens so we can search by indexOf in the saved XML.
      idx = doc.insertParagraph(0, idx, 'HDG_ALPHA 추진 배경');
      idx = doc.insertParagraph(0, idx, 'PNT_ALPHA 주요 현황 요약');
      idx = doc.insertParagraph(0, idx, 'TBL_TITLE_ALPHA 현황표');

      const t1 = doc.insertTable(0, idx, 2, 2, {
        borderFillIDRef: '2',
        headerCells: ['TH_ALPHA_1', 'TH_ALPHA_2'],
        bodyCells: [['TB_ALPHA_1', 'TB_ALPHA_2']],
      });
      expect(t1, 'first insertTable should succeed').not.toBeNull();
      idx = idx + 1;

      idx = doc.insertParagraph(0, idx, 'NOTE_ALPHA 주: 출처');
      idx = doc.insertParagraph(0, idx, 'HDG_BETA 구축 일정');

      const t2 = doc.insertTable(0, idx, 2, 2, {
        borderFillIDRef: '2',
        headerCells: ['TH_BETA_1', 'TH_BETA_2'],
        bodyCells: [['TB_BETA_1', 'TB_BETA_2']],
      });
      expect(t2, 'second insertTable should succeed').not.toBeNull();

      const saved = await doc.save();
      const zip = await JSZip.loadAsync(saved);
      const xml = await zip.file('Contents/section0.xml')!.async('string');

      // Every marker must be present in the saved XML.
      const markers = {
        HDG_ALPHA: xml.indexOf('HDG_ALPHA'),
        PNT_ALPHA: xml.indexOf('PNT_ALPHA'),
        TBL_TITLE_ALPHA: xml.indexOf('TBL_TITLE_ALPHA'),
        TH_ALPHA_1: xml.indexOf('TH_ALPHA_1'),
        NOTE_ALPHA: xml.indexOf('NOTE_ALPHA'),
        HDG_BETA: xml.indexOf('HDG_BETA'),
        TH_BETA_1: xml.indexOf('TH_BETA_1'),
      };
      for (const [name, pos] of Object.entries(markers)) {
        expect(pos, `${name} missing from saved XML`).toBeGreaterThan(-1);
      }

      // Insert order must be preserved end-to-end. Previously TH_ALPHA_1 /
      // TH_BETA_1 landed *before* HDG_ALPHA because both tables drifted to
      // the top of the section.
      expect(markers.HDG_ALPHA).toBeLessThan(markers.PNT_ALPHA);
      expect(markers.PNT_ALPHA).toBeLessThan(markers.TBL_TITLE_ALPHA);
      expect(markers.TBL_TITLE_ALPHA).toBeLessThan(markers.TH_ALPHA_1);
      expect(markers.TH_ALPHA_1).toBeLessThan(markers.NOTE_ALPHA);
      expect(markers.NOTE_ALPHA).toBeLessThan(markers.HDG_BETA);
      expect(markers.HDG_BETA).toBeLessThan(markers.TH_BETA_1);

      // Sanity: the frame's 2 decorative tables + 2 newly-inserted tables
      // should all be present as top-level <hp:tbl> entries in the XML.
      const tblOpens = xml.match(/<hp:tbl\b/g) || [];
      expect(tblOpens.length).toBeGreaterThanOrEqual(4);
    });

    it('save → reload → resave keeps the interleaved order stable (round-trip)', async () => {
      const buf = fs.readFileSync(GONGMUN);
      const doc = await HwpxDocument.createFromBuffer('bug-nested-tbl-2', GONGMUN, buf);

      let idx = doc.getElementCount(0) - 1;
      idx = doc.insertParagraph(0, idx, 'RELOAD_HDG_A');
      idx = doc.insertParagraph(0, idx, 'RELOAD_TITLE_A');
      const t1 = doc.insertTable(0, idx, 2, 2, {
        borderFillIDRef: '2',
        headerCells: ['RH_A_1', 'RH_A_2'],
        bodyCells: [['RB_A_1', 'RB_A_2']],
      });
      expect(t1).not.toBeNull();
      idx = idx + 1;
      idx = doc.insertParagraph(0, idx, 'RELOAD_HDG_B');
      const t2 = doc.insertTable(0, idx, 2, 2, {
        borderFillIDRef: '2',
        headerCells: ['RH_B_1', 'RH_B_2'],
        bodyCells: [['RB_B_1', 'RB_B_2']],
      });
      expect(t2).not.toBeNull();

      // Save #1.
      const saved1 = await doc.save();

      // Reload and resave (no further edits). Catches a class of bug where
      // the parser re-reads the saved file in a different order, which would
      // corrupt on the *next* save even though save #1 was correct.
      const reloaded = await HwpxDocument.createFromBuffer(
        'bug-nested-tbl-2-reload',
        GONGMUN,
        saved1,
      );
      const saved2 = await reloaded.save();

      const zip = await JSZip.loadAsync(saved2);
      const xml = await zip.file('Contents/section0.xml')!.async('string');

      const pHdgA = xml.indexOf('RELOAD_HDG_A');
      const pTitleA = xml.indexOf('RELOAD_TITLE_A');
      const pTblA = xml.indexOf('RH_A_1');
      const pHdgB = xml.indexOf('RELOAD_HDG_B');
      const pTblB = xml.indexOf('RH_B_1');

      for (const [name, pos] of [
        ['RELOAD_HDG_A', pHdgA],
        ['RELOAD_TITLE_A', pTitleA],
        ['RH_A_1', pTblA],
        ['RELOAD_HDG_B', pHdgB],
        ['RH_B_1', pTblB],
      ] as const) {
        expect(pos, `${name} missing from round-tripped XML`).toBeGreaterThan(-1);
      }

      expect(pHdgA).toBeLessThan(pTitleA);
      expect(pTitleA).toBeLessThan(pTblA);
      expect(pTblA).toBeLessThan(pHdgB);
      expect(pHdgB).toBeLessThan(pTblB);
    });
  });
});
