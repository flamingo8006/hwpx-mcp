import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import JSZip from 'jszip';
import { HwpxDocument } from './HwpxDocument';
import {
  getTemplateProfile,
  verifyProfileAgainstHeader,
  resolveParagraphPreset,
  resolveTableCellPreset,
} from './TemplateProfiles';

const TEMPLATES_DIR = path.join(os.homedir(), 'Documents', 'skills', 'templates');
const GONGMUN = path.join(TEMPLATES_DIR, '공문서_프레임.hwpx');
const EXPENSE = path.join(TEMPLATES_DIR, '업무추진비_집행내역서.hwpx');

// Guard: skip if templates not staged on this machine (CI safety).
const hasGongmun = fs.existsSync(GONGMUN);
const hasExpense = fs.existsSync(EXPENSE);

describe('Template modes — E2E against real templates', () => {
  const d = hasGongmun ? describe : describe.skip;

  d('mode (B) style-palette — gongmun_v1 against 공문서_프레임.hwpx', () => {
    it('profile fingerprint validates against the real template header.xml', async () => {
      const buf = fs.readFileSync(GONGMUN);
      const zip = await JSZip.loadAsync(buf);
      const headerXml = await zip.file('Contents/header.xml')!.async('string');

      const profile = getTemplateProfile('gongmun_v1')!;
      const check = verifyProfileAgainstHeader(profile, headerXml);
      // If this fails, the real template's style palette has drifted from
      // the one stamped into TemplateProfiles.ts — either re-inspect and
      // bump the profile, or confirm which version is the source of truth.
      expect(check.failures, `Profile assertions against real template: ${check.failures.join('\n')}`).toEqual([]);
      expect(check.ok).toBe(true);
    });

    it('insertParagraph with preset "heading" emits paraPrIDRef="22" + charPrIDRef="8"', async () => {
      const buf = fs.readFileSync(GONGMUN);
      const doc = await HwpxDocument.createFromBuffer('e2e-b', GONGMUN, buf);

      const profile = getTemplateProfile('gongmun_v1')!;
      const preset = resolveParagraphPreset(profile, 'heading')!;

      // Append body paragraph after the document body (use count - 1).
      const lastIdx = doc.getElementCount(0) - 1;
      const idx = doc.insertParagraph(0, lastIdx, '□ 추진 배경 (e2e)', undefined, {
        overrideParaPrIDRef: preset.paraPrIDRef,
        overrideCharPrIDRef: preset.charPrIDRef,
      });
      expect(idx).toBeGreaterThan(0);

      const saved = await doc.save();
      const z = await JSZip.loadAsync(saved);
      const xml = await z.file('Contents/section0.xml')!.async('string');

      // Our new paragraph must carry the preset-resolved ids verbatim.
      expect(xml).toMatch(/<hp:p\s+id="[^"]+"\s+paraPrIDRef="22"[^>]*>\s*<hp:run\s+charPrIDRef="8">[\s\S]*?□ 추진 배경/);
    });

    it('insertTable with table_header/table_body preset emits template cells', async () => {
      const buf = fs.readFileSync(GONGMUN);
      const doc = await HwpxDocument.createFromBuffer('e2e-b2', GONGMUN, buf);

      const profile = getTemplateProfile('gongmun_v1')!;
      const header = resolveTableCellPreset(profile, 'table_header')!;
      const body = resolveTableCellPreset(profile, 'table_body')!;

      const lastIdx = doc.getElementCount(0) - 1;
      const res = doc.insertTable(0, lastIdx, 3, 3, {
        colWidths: [8000, 22000, 12520],
        overrideHeaderParaPrIDRef: header.paraPrIDRef,
        overrideHeaderCharPrIDRef: header.charPrIDRef,
        overrideBodyParaPrIDRef: body.paraPrIDRef,
        overrideBodyCharPrIDRef: body.charPrIDRef,
        borderFillIDRef: header.borderFillIDRef,
        headerCells: ['차수', '교육 주제', '시간·정원'],
        bodyCells: [
          ['1차', 'AI 기초', '3H·40명'],
          ['2차', 'AI 심화', '4H·40명'],
        ],
      });
      expect(res).not.toBeNull();

      const saved = await doc.save();
      const z = await JSZip.loadAsync(saved);
      const xml = await z.file('Contents/section0.xml')!.async('string');

      // Header row carries preset IDs (31/29 per gongmun_v1).
      const allRows = xml.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g)!;
      // Find rows belonging to our new table — look for the unique header text.
      const ourHeader = allRows.find(r => r.includes('차수') && r.includes('교육 주제'));
      expect(ourHeader).toBeDefined();
      expect(ourHeader!).toContain('paraPrIDRef="31"');
      expect(ourHeader!).toContain('charPrIDRef="29"');

      const ourBody1 = allRows.find(r => r.includes('1차') && r.includes('AI 기초'));
      expect(ourBody1).toBeDefined();
      expect(ourBody1!).toContain('paraPrIDRef="32"');
      expect(ourBody1!).toContain('charPrIDRef="30"');
    });
  });

  const d2 = hasExpense ? describe : describe.skip;
  d2('mode (A) form-fill — 업무추진비_집행내역서.hwpx placeholder replacement', () => {
    it('all documented placeholders exist in the template text', async () => {
      const buf = fs.readFileSync(EXPENSE);
      const zip = await JSZip.loadAsync(buf);
      const sectionXml = await zip.file('Contents/section0.xml')!.async('string');

      const expected = [
        '{{부서}}', '{{사용자}}', '{{일자}}', '{{장소}}', '{{목적}}',
        '{{참석자수}}', '{{참석자1}}', '{{참석자2}}', '{{참석자3}}',
        '{{금액한글}}', '{{금액}}', '{{1인금액}}',
        '{{회의내용1}}', '{{회의내용2}}',
      ];
      const missing = expected.filter(p => !sectionXml.includes(p));
      expect(missing, `Missing placeholders in 업무추진비_집행내역서.hwpx: ${missing.join(', ')}`).toEqual([]);
    });

    it('batch_replace-like flow replaces every placeholder and produces a valid zip', async () => {
      const buf = fs.readFileSync(EXPENSE);
      const doc = await HwpxDocument.createFromBuffer('e2e-a', EXPENSE, buf);

      // Simulate what batch_replace would do — one updateParagraphText-equivalent
      // per placeholder via the document's public API. Using in-section search.
      const pairs: Array<[string, string]> = [
        ['{{부서}}', '정보전산팀'],
        ['{{사용자}}', '김○○'],
        ['{{일자}}', '2026-04-23'],
        ['{{장소}}', '대구시 달성군 ○○식당'],
        ['{{목적}}', 'E2E 테스트 회의'],
        ['{{참석자수}}', '3'],
        ['{{참석자1}}', '김○○'],
        ['{{참석자2}}', '이○○'],
        ['{{참석자3}}', '박○○'],
        ['{{금액한글}}', '구만원'],
        ['{{금액}}', '90,000'],
        ['{{1인금액}}', '30,000'],
        ['{{회의내용1}}', '1차: 교육 커리큘럼 검토'],
        ['{{회의내용2}}', '2차: 차기 일정 조율'],
      ];
      for (const [from, to] of pairs) {
        doc.replaceText(from, to);
      }

      const saved = await doc.save();
      const z = await JSZip.loadAsync(saved);
      const sectionXml = await z.file('Contents/section0.xml')!.async('string');

      // No placeholders left.
      const remaining = pairs.map(([k]) => k).filter(p => sectionXml.includes(p));
      expect(remaining).toEqual([]);

      // Sample replacements landed.
      expect(sectionXml).toContain('정보전산팀');
      expect(sectionXml).toContain('E2E 테스트 회의');
      expect(sectionXml).toContain('90,000');
    });
  });

  describe('mode (C) free-form — create_document + build_document', () => {
    it('creates a doc, inserts inline-styled paragraph, round-trips cleanly', async () => {
      const tmp = path.join(os.tmpdir(), `hwpx-free-${Date.now()}.hwpx`);
      const doc = await HwpxDocument.createNew('free-e2e', tmp);

      // Simulate build_document free-form: paragraph + table, no presets.
      const idx = doc.insertParagraph(0, -1, '자유형 보고서', { bold: true, fontSize: 18 });
      expect(idx).toBeGreaterThanOrEqual(0);
      const t = doc.insertTable(0, idx, 2, 3, {
        colWidths: [14000, 14000, 14520],
      });
      expect(t).not.toBeNull();
      doc.updateTableCell(0, t!.tableIndex, 0, 0, '헤더1');
      doc.updateTableCell(0, t!.tableIndex, 0, 1, '헤더2');
      doc.updateTableCell(0, t!.tableIndex, 0, 2, '헤더3');
      doc.updateTableCell(0, t!.tableIndex, 1, 0, '데이터A');

      const saved = await doc.save();
      const z = await JSZip.loadAsync(saved);
      const sectionXml = await z.file('Contents/section0.xml')!.async('string');
      expect(sectionXml).toContain('자유형 보고서');
      expect(sectionXml).toContain('헤더1');
      expect(sectionXml).toContain('데이터A');

      // Reload and verify text is persistent.
      const reloaded = await HwpxDocument.createFromBuffer('free-e2e-2', tmp, saved);
      const allText = reloaded.getAllText();
      expect(allText).toContain('자유형 보고서');
    });
  });
});
