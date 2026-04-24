import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HwpxDocument } from './HwpxDocument';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

/**
 * Regression test for the wrapsTable-wrapper delete bug.
 *
 * `applyParagraphDeletesToXml` used `xml.indexOf('</hp:p>', elem.start)` to
 * find the closing tag when deleting a top-level paragraph. For a paragraph
 * whose body wraps a nested <hp:tbl> (a "wrapsTable" wrapper — e.g. DGIST
 * frame templates' decorative guidance boxes), that first </hp:p> lives
 * inside one of the table's cell subLists, so the slice truncated the XML
 * mid-cell and left dangling </hp:tc>/</hp:tr>/</hp:tbl> tags.
 *
 * The table-delete branch already uses depth-aware matching. The fix mirrors
 * that logic for <hp:p>: count opens of `<hp:p ` / `<hp:p>`, skip self-closing
 * `<hp:p .../>` and non-matches like `<hp:pic ` / `<hp:pos `, and pair with
 * </hp:p> at depth 0.
 */
describe('delete wrapsTable paragraph — depth-aware close matching', () => {
  const testDir = path.join(__dirname, 'test-temp-wraps-table-delete');
  const realTemplatePath = path.join(
    process.env.HOME || '',
    'Documents/skills/templates/공문서_프레임.hwpx.bak.20260423_235831'
  );

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Inject a wrapsTable wrapper paragraph + a plain trailing paragraph into
   * the seed section. Returns the saved buffer (ready to createFromBuffer).
   * The wrapper paragraph body mirrors the parser-observed shape: a <hp:run>
   * that contains an <hp:tbl>, whose single cell subList has its own <hp:p>.
   */
  async function buildFixtureBuffer(): Promise<Buffer> {
    const seed = HwpxDocument.createNew('wraps-table-delete-seed');
    seed.insertParagraph(0, 0, 'ANCHOR');
    const seedBuf = await seed.save();

    const zip = await JSZip.loadAsync(seedBuf);
    const rawXml = await zip.file('Contents/section0.xml')?.async('string');
    if (!rawXml) throw new Error('seed section0.xml missing');

    const linesegArray =
      '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000"' +
      ' textheight="1000" baseline="850" spacing="600" horzpos="0"' +
      ' horzsize="0" flags="0"/></hp:linesegarray>';

    // Decorative guidance paragraph that WRAPS a nested tbl — a paragraph
    // whose run body contains both text and an <hp:tbl>. Parser-observed
    // shape for DGIST 작성지침 boxes.
    const wrapperParaXml =
      '<hp:p id="2147480001" paraPrIDRef="0" styleIDRef="0" pageBreak="0"' +
      ' columnBreak="0" merged="0">' +
      '<hp:run charPrIDRef="0">' +
      '<hp:t>wrapper-text</hp:t>' +
      '<hp:tbl id="2147480002" zOrder="0" numberingType="TABLE"' +
      ' textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0"' +
      ' dropcapstyle="None" pageBreak="CELL" repeatHeader="0"' +
      ' rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="2"' +
      ' noAdjust="0">' +
      '<hp:sz width="10000" widthRelTo="ABSOLUTE" height="1000"' +
      ' heightRelTo="ABSOLUTE" protect="0"/>' +
      '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1"' +
      ' allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA"' +
      ' horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT"' +
      ' vertOffset="0" horzOffset="0"/>' +
      '<hp:outMargin left="141" right="141" top="141" bottom="141"/>' +
      '<hp:inMargin left="0" right="0" top="0" bottom="0"/>' +
      '<hp:tr>' +
      '<hp:tc name="" header="0" hasMargin="0" protect="0"' +
      ' editable="0" dirty="0" borderFillIDRef="2">' +
      '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK"' +
      ' vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0"' +
      ' textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
      '<hp:p id="2147480003" paraPrIDRef="0" styleIDRef="0"' +
      ' pageBreak="0" columnBreak="0" merged="0">' +
      '<hp:run charPrIDRef="0"><hp:t>cell-text</hp:t></hp:run>' +
      linesegArray +
      '</hp:p>' +
      '</hp:subList>' +
      '<hp:cellAddr colAddr="0" rowAddr="0"/>' +
      '<hp:cellSpan colSpan="1" rowSpan="1"/>' +
      '<hp:cellSz width="10000" height="1000"/>' +
      '<hp:cellMargin left="141" right="141" top="141" bottom="141"/>' +
      '</hp:tc>' +
      '</hp:tr>' +
      '<hp:colSz>10000</hp:colSz>' +
      '</hp:tbl>' +
      '<hp:t></hp:t>' +
      '</hp:run>' +
      linesegArray +
      '</hp:p>';

    const trailingParaXml =
      '<hp:p id="2147480004" paraPrIDRef="0" styleIDRef="0" pageBreak="0"' +
      ' columnBreak="0" merged="0">' +
      '<hp:run charPrIDRef="0"><hp:t>TAIL_AFTER_WRAPPER</hp:t></hp:run>' +
      linesegArray +
      '</hp:p>';

    let sectionCloseIdx = rawXml.lastIndexOf('</hs:sec>');
    if (sectionCloseIdx === -1) sectionCloseIdx = rawXml.lastIndexOf('</hp:sec>');
    if (sectionCloseIdx === -1) throw new Error('section closing tag not found');

    const injected =
      rawXml.slice(0, sectionCloseIdx) +
      wrapperParaXml +
      trailingParaXml +
      rawXml.slice(sectionCloseIdx);
    zip.file('Contents/section0.xml', injected);

    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
  }

  function countOccurrences(haystack: string, needle: string): number {
    let count = 0;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      count++;
      idx = haystack.indexOf(needle, idx + needle.length);
    }
    return count;
  }

  function countOpenPTags(xml: string): number {
    // <hp:p followed by whitespace, '>', or '/' — matches both attr and
    // no-attr forms plus self-closing tokens (which also have a matching
    // implicit close — but for balance we count opens and closes of the
    // full <hp:p>...</hp:p> pairing and self-closing </hp:p> never appears).
    let count = 0;
    const openLit = '<hp:p';
    let i = xml.indexOf(openLit);
    while (i !== -1) {
      const after = xml[i + openLit.length];
      if (after === ' ' || after === '>' || after === '\t' || after === '\n' || after === '\r' || after === '/') {
        const tagEnd = xml.indexOf('>', i);
        const selfClosing = tagEnd !== -1 && xml[tagEnd - 1] === '/';
        if (!selfClosing) count++;
      }
      i = xml.indexOf(openLit, i + openLit.length);
    }
    return count;
  }

  it('synthetic fixture: deletes only the wrapper paragraph, leaves subsequent content intact', async () => {
    const seededBuf = await buildFixtureBuffer();
    const seededPath = path.join(testDir, 'fixture.hwpx');
    fs.writeFileSync(seededPath, seededBuf);

    const doc = await HwpxDocument.createFromBuffer('wraps-table-delete', seededPath, seededBuf);

    // Pre-delete XML must contain every marker — this proves the fixture
    // actually shipped the wrapper, inner cell, and trailing paragraph.
    const preZip = await JSZip.loadAsync(seededBuf);
    const preXml = (await preZip.file('Contents/section0.xml')?.async('string'))!;
    expect(preXml).toContain('wrapper-text');
    expect(preXml).toContain('cell-text');
    expect(preXml).toContain('TAIL_AFTER_WRAPPER');

    // Locate the wrapper paragraph by scanning the in-memory element list.
    // getParagraphs() returns `{ index, text, ... }` for every non-table
    // element; the wrapper's text starts with "wrapper-text".
    const paras = doc.getParagraphs(0);
    const wrapper = paras.find(p => p.text.includes('wrapper-text'));
    expect(wrapper).toBeTruthy();
    const wrapperIdx = wrapper!.index;

    const deleted = doc.deleteParagraph(0, wrapperIdx);
    expect(deleted).toBe(true);

    const outBuf = await doc.save();
    const outZip = await JSZip.loadAsync(outBuf);
    const xmlOut = await outZip.file('Contents/section0.xml')?.async('string');
    expect(xmlOut).toBeTruthy();

    // (a) wrapper text is gone
    expect(xmlOut).not.toContain('wrapper-text');
    // The nested cell text MUST also be gone — deleting the wrapper <hp:p>
    // removes everything between its open/close, including the nested tbl.
    expect(xmlOut).not.toContain('cell-text');

    // (b) trailing top-level paragraph survives
    expect(xmlOut).toContain('TAIL_AFTER_WRAPPER');

    // (d) balanced <hp:p>…</hp:p> counts
    const closeCount = countOccurrences(xmlOut!, '</hp:p>');
    const openCount = countOpenPTags(xmlOut!);
    expect(openCount).toBe(closeCount);

    // No orphan table/cell closers left behind (the pre-fix slice cut mid-cell
    // and left a dangling </hp:tc></hp:tr></hp:tbl> chain).
    const tblOpen = countOccurrences(xmlOut!, '<hp:tbl');
    const tblClose = countOccurrences(xmlOut!, '</hp:tbl>');
    expect(tblOpen).toBe(tblClose);
    const tcOpen = countOccurrences(xmlOut!, '<hp:tc');
    const tcClose = countOccurrences(xmlOut!, '</hp:tc>');
    expect(tcOpen).toBe(tcClose);

    // (c) saved zip round-trips through createFromBuffer without parse errors.
    const outPath = path.join(testDir, 'out.hwpx');
    fs.writeFileSync(outPath, outBuf);
    const reopened = await HwpxDocument.createFromBuffer('wraps-table-delete-reopened', outPath, outBuf);
    const reopenedParas = reopened.getParagraphs(0);
    const reopenedTexts = reopenedParas.map(p => p.text);
    expect(reopenedTexts.some(t => t.includes('TAIL_AFTER_WRAPPER'))).toBe(true);
    expect(reopenedTexts.every(t => !t.includes('wrapper-text'))).toBe(true);
    expect(reopenedTexts.every(t => !t.includes('cell-text'))).toBe(true);
  });

  it('real template (when present): deleting any wrapsTable wrapper keeps XML balanced', async () => {
    if (!fs.existsSync(realTemplatePath)) return; // environment-specific; skip gracefully.

    const buf = fs.readFileSync(realTemplatePath);
    const doc = await HwpxDocument.createFromBuffer('real-template-wraps-delete', realTemplatePath, buf);

    // Heuristic: a wrapsTable wrapper paragraph's raw XML (as tracked by the
    // parser) contains a nested <hp:tbl>. We don't rely on any _xmlPosition
    // field — instead, pre-read section0.xml, find top-level <hp:p> bodies
    // that contain <hp:tbl>, and delete the first such paragraph by its
    // in-memory element index.
    const preZip = await JSZip.loadAsync(buf);
    const preXml = (await preZip.file('Contents/section0.xml')?.async('string'))!;

    // Walk top-level elements in the raw XML to find the first <hp:p> that
    // contains an <hp:tbl> (wrapsTable). The in-memory elements list
    // preserves document order, so we map by position.
    const paras = doc.getParagraphs(0);
    let wrapperIdx = -1;
    for (const para of paras) {
      // Find this paragraph's body in the raw XML by its stable id.
      const stableId = (para as unknown as { id?: string }).id;
      if (!stableId) continue;
      const openIdx = preXml.indexOf(`<hp:p id="${stableId}"`);
      if (openIdx === -1) continue;
      const closeIdx = preXml.indexOf('</hp:p>', openIdx);
      if (closeIdx === -1) continue;
      // Depth-aware close — same issue the production code had, so do it right.
      let depth = 1;
      let pos = preXml.indexOf('>', openIdx) + 1;
      let endPos = -1;
      while (depth > 0 && pos < preXml.length) {
        const nc = preXml.indexOf('</hp:p>', pos);
        if (nc === -1) break;
        const no = preXml.indexOf('<hp:p', pos);
        const afterChar = no === -1 ? '' : preXml[no + '<hp:p'.length];
        const isOpen = no !== -1 && no < nc && (afterChar === ' ' || afterChar === '>' || afterChar === '\n' || afterChar === '\t' || afterChar === '\r');
        if (isOpen) {
          const tagEnd = preXml.indexOf('>', no);
          if (tagEnd !== -1 && preXml[tagEnd - 1] === '/') {
            pos = tagEnd + 1;
            continue;
          }
          depth++;
          pos = no + 1;
        } else {
          depth--;
          if (depth === 0) { endPos = nc + '</hp:p>'.length; break; }
          pos = nc + 1;
        }
      }
      if (endPos === -1) continue;
      const body = preXml.substring(openIdx, endPos);
      if (/<hp:tbl[\s>]/.test(body)) {
        wrapperIdx = para.index;
        break;
      }
    }

    if (wrapperIdx === -1) {
      // Template has no wrapsTable wrappers in section0 — nothing to test.
      return;
    }

    const deleted = doc.deleteParagraph(0, wrapperIdx);
    expect(deleted).toBe(true);

    const outBuf = await doc.save();

    // Round-trip and verify balanced counts + parse.
    const outZip = await JSZip.loadAsync(outBuf);
    const xmlOut = (await outZip.file('Contents/section0.xml')?.async('string'))!;
    expect(countOccurrences(xmlOut, '<hp:tbl')).toBe(countOccurrences(xmlOut, '</hp:tbl>'));
    expect(countOccurrences(xmlOut, '<hp:tc')).toBe(countOccurrences(xmlOut, '</hp:tc>'));
    expect(countOccurrences(xmlOut, '<hp:tr')).toBe(countOccurrences(xmlOut, '</hp:tr>'));
    expect(countOpenPTags(xmlOut)).toBe(countOccurrences(xmlOut, '</hp:p>'));

    // Reopen must succeed.
    const outPath = path.join(testDir, 'real-template-out.hwpx');
    fs.writeFileSync(outPath, outBuf);
    const reopened = await HwpxDocument.createFromBuffer('real-template-reopened', outPath, outBuf);
    expect(reopened.getParagraphs(0).length).toBeGreaterThan(0);
  });
});
