import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { HwpxDocument } from './HwpxDocument';

/**
 * Create a test HWPX with Korean text and charPr definitions for format_text testing.
 */
async function createTestHwpxBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:docInfo>
    <hh:title>Format Text Test</hh:title>
  </hh:docInfo>
  <hh:charProperties itemCnt="1">
    <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
    </hh:charPr>
  </hh:charProperties>
</hh:head>`;

  const sectionXml = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>사전 요구사항</hp:t></hp:run>
  </hp:p>
  <hp:p id="2" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>Hello World Test</hp:t></hp:run>
  </hp:p>
  <hp:p id="3" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>첫 번째</hp:t></hp:run>
    <hp:run charPrIDRef="0"><hp:t> 두 번째</hp:t></hp:run>
  </hp:p>
</hs:sec>`;

  zip.file('Contents/header.xml', headerXml);
  zip.file('Contents/section0.xml', sectionXml);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file('mimetype', 'application/hwp+zip');
  zip.file('Contents/content.hpf', '<pkg/>');

  return await zip.generateAsync({ type: 'nodebuffer' });
}

describe('format_text - Character Range Formatting', () => {
  let testFilePath: string;

  beforeEach(async () => {
    const buffer = await createTestHwpxBuffer();
    testFilePath = path.join(__dirname, '..', 'test-format-text.hwpx');
    fs.writeFileSync(testFilePath, buffer);
  });

  it('should format Korean text range correctly (character-based, not byte-based)', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // "사전 요구사항" — bold "요구사항" (start=3, end=7)
    const result = doc.formatTextRange(0, 0, 3, 7, { bold: true });
    expect(result).toBe(true);

    // Verify in-memory: should have 3 runs: "사전 " | "요구사항" (bold) | (none)
    const para = doc.getParagraph(0, 0);
    expect(para).toBeDefined();
    expect(para!.runs.length).toBe(2); // "사전 " + "요구사항"
    expect(para!.runs[0].text).toBe('사전 ');
    expect(para!.runs[1].text).toBe('요구사항');
    expect(para!.runs[1].charStyle?.bold).toBe(true);
  });

  it('should handle full paragraph range', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // "사전 요구사항" — bold entire text (start=0, end=7)
    const result = doc.formatTextRange(0, 0, 0, 7, { bold: true });
    expect(result).toBe(true);

    const para = doc.getParagraph(0, 0);
    expect(para!.runs.length).toBe(1);
    expect(para!.runs[0].text).toBe('사전 요구사항');
    expect(para!.runs[0].charStyle?.bold).toBe(true);
  });

  it('should format middle of ASCII text', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // "Hello World Test" — italic "World" (start=6, end=11)
    const result = doc.formatTextRange(0, 1, 6, 11, { italic: true });
    expect(result).toBe(true);

    const para = doc.getParagraph(0, 1);
    expect(para!.runs.length).toBe(3); // "Hello " | "World" | " Test"
    expect(para!.runs[0].text).toBe('Hello ');
    expect(para!.runs[1].text).toBe('World');
    expect(para!.runs[1].charStyle?.italic).toBe(true);
    expect(para!.runs[2].text).toBe(' Test');
  });

  it('should handle range spanning multiple runs', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // Paragraph 2: "첫 번째" (run0) + " 두 번째" (run1) = "첫 번째 두 번째"
    // Bold from pos 2 to pos 6: "번째 두" (crosses run boundary)
    const result = doc.formatTextRange(0, 2, 2, 6, { bold: true });
    expect(result).toBe(true);

    const para = doc.getParagraph(0, 2);
    // Should split into: "첫 " | "번째" (bold) | " 두" (bold) | " 번째"
    // Or merged: depends on implementation — at least the styled chars should be bold
    const fullText = para!.runs.map(r => r.text).join('');
    expect(fullText).toBe('첫 번째 두 번째');

    // Check that "번째" and " 두" are bolded
    const boldRuns = para!.runs.filter(r => r.charStyle?.bold === true);
    const boldText = boldRuns.map(r => r.text).join('');
    expect(boldText).toBe('번째 두');
  });

  it('should clamp end_pos to text length', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // "사전 요구사항" (length 7) — end_pos=100 should clamp to 7
    const result = doc.formatTextRange(0, 0, 3, 100, { bold: true });
    expect(result).toBe(true);

    const para = doc.getParagraph(0, 0);
    expect(para!.runs[para!.runs.length - 1].charStyle?.bold).toBe(true);
  });

  it('should reject invalid positions', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    expect(doc.formatTextRange(0, 0, -1, 3, { bold: true })).toBe(false);
    expect(doc.formatTextRange(0, 0, 5, 3, { bold: true })).toBe(false); // start > end
    expect(doc.formatTextRange(0, 0, 100, 200, { bold: true })).toBe(false); // beyond text
    expect(doc.formatTextRange(0, 99, 0, 3, { bold: true })).toBe(false); // invalid paragraph
  });

  it('should handle two consecutive format_text calls on same paragraph', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // "Hello World Test"
    // First: bold "Hello" (0-5)
    doc.formatTextRange(0, 1, 0, 5, { bold: true });
    // Second: italic "Test" (12-16)
    doc.formatTextRange(0, 1, 12, 16, { italic: true });

    const para = doc.getParagraph(0, 1);
    const fullText = para!.runs.map(r => r.text).join('');
    expect(fullText).toBe('Hello World Test');

    // Find bold and italic runs
    const boldRuns = para!.runs.filter(r => r.charStyle?.bold === true);
    expect(boldRuns.map(r => r.text).join('')).toContain('Hello');

    const italicRuns = para!.runs.filter(r => r.charStyle?.italic === true);
    expect(italicRuns.map(r => r.text).join('')).toContain('Test');
  });

  it('should format a single character', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // Bold only "사" (start=0, end=1) in "사전 요구사항"
    const result = doc.formatTextRange(0, 0, 0, 1, { bold: true });
    expect(result).toBe(true);

    const para = doc.getParagraph(0, 0);
    expect(para!.runs[0].text).toBe('사');
    expect(para!.runs[0].charStyle?.bold).toBe(true);
    expect(para!.runs[1].text).toBe('전 요구사항');
  });

  it('should reject invalid section index', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    expect(doc.formatTextRange(99, 0, 0, 3, { bold: true })).toBe(false);
  });

  it('should persist format_text after save and reload', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // Bold "요구사항" in "사전 요구사항"
    doc.formatTextRange(0, 0, 3, 7, { bold: true });

    // Save
    const savedBuffer = await doc.save();

    // Check saved XML has multiple runs
    const savedZip = await JSZip.loadAsync(savedBuffer);
    const sectionXml = await savedZip.file('Contents/section0.xml')?.async('string');
    expect(sectionXml).toBeDefined();

    // Should have at least 2 <hp:run> elements in the first paragraph
    const firstParaMatch = sectionXml!.match(/<hp:p[^>]*id="1"[^>]*>([\s\S]*?)<\/hp:p>/);
    expect(firstParaMatch).toBeDefined();
    const runCount = (firstParaMatch![1].match(/<hp:run/g) || []).length;
    expect(runCount).toBeGreaterThanOrEqual(2);

    // Verify header.xml has new charPr with bold
    const headerXml = await savedZip.file('Contents/header.xml')?.async('string');
    expect(headerXml).toBeDefined();
    expect(headerXml).toContain('<hh:bold/>');
  });
});

describe('insert_table - Column Widths', () => {
  let testFilePath: string;

  beforeEach(async () => {
    const buffer = await createTestHwpxBuffer();
    testFilePath = path.join(__dirname, '..', 'test-col-widths.hwpx');
    fs.writeFileSync(testFilePath, buffer);
  });

  it('should create table with uniform column widths by default', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    const result = doc.insertTable(0, 0, 2, 3);
    expect(result).not.toBeNull();

    const tables = doc.getTables();
    const newTable = tables[tables.length - 1];
    expect(newTable).toBeDefined();
  });

  it('should create table with custom column widths and persist in XML', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    const colWidths = [10000, 15000, 17520];
    const result = doc.insertTable(0, 0, 2, 3, { colWidths });
    expect(result).not.toBeNull();

    // Verify via save + XML inspection
    const savedBuffer = await doc.save();
    const savedZip = await JSZip.loadAsync(savedBuffer);
    const sectionXml = await savedZip.file('Contents/section0.xml')?.async('string');

    // colSz should contain the exact widths
    expect(sectionXml).toContain('<hp:colSz>10000 15000 17520</hp:colSz>');

    // Total table width should be sum of colWidths = 42520
    expect(sectionXml).toContain('width="42520"');
  });

  it('should reject col_widths with wrong length', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // 3 columns but only 2 widths
    const result = doc.insertTable(0, 0, 2, 3, { colWidths: [10000, 15000] });
    expect(result).toBeNull();
  });

  it('should generate colSz XML after save', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    const colWidths = [10000, 15000, 17520];
    doc.insertTable(0, 0, 2, 3, { colWidths });

    const savedBuffer = await doc.save();
    const savedZip = await JSZip.loadAsync(savedBuffer);
    const sectionXml = await savedZip.file('Contents/section0.xml')?.async('string');

    expect(sectionXml).toBeDefined();
    expect(sectionXml).toContain('<hp:colSz>10000 15000 17520</hp:colSz>');
  });

  it('should set individual cell widths in XML', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    doc.insertTable(0, 0, 1, 2, { colWidths: [20000, 22520] });

    const savedBuffer = await doc.save();
    const savedZip = await JSZip.loadAsync(savedBuffer);
    const sectionXml = await savedZip.file('Contents/section0.xml')?.async('string');

    // Each cell should have its own width
    expect(sectionXml).toContain('width="20000"');
    expect(sectionXml).toContain('width="22520"');
  });

  it('should persist col_widths after save and reload', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    doc.insertTable(0, 0, 2, 3, { colWidths: [8000, 14520, 20000] });
    const savedBuffer = await doc.save();

    // Reload
    const reloadPath = testFilePath + '.reload.hwpx';
    fs.writeFileSync(reloadPath, savedBuffer);
    const doc2 = await HwpxDocument.createFromBuffer('test-id-2', reloadPath, fs.readFileSync(reloadPath));

    // After reload, getTables should list the table
    const tables = doc2.getTables();
    expect(tables.length).toBeGreaterThan(0);

    // Verify XML still has colSz
    const zip = await JSZip.loadAsync(savedBuffer);
    const xml = await zip.file('Contents/section0.xml')?.async('string');
    expect(xml).toContain('<hp:colSz>8000 14520 20000</hp:colSz>');

    // Clean up
    try { fs.unlinkSync(reloadPath); } catch {}
  });

  it('should compensate rounding remainder on last column', async () => {
    const doc = await HwpxDocument.createFromBuffer('test-id', testFilePath, fs.readFileSync(testFilePath));

    // 42520 / 3 = 14173.33... → floor = 14173, remainder = 1
    doc.insertTable(0, 0, 1, 3, { width: 42520 });

    const savedBuffer = await doc.save();
    const savedZip = await JSZip.loadAsync(savedBuffer);
    const sectionXml = await savedZip.file('Contents/section0.xml')?.async('string');

    // colSz should sum to exactly 42520
    const colSzMatch = sectionXml!.match(/<hp:colSz>([^<]+)<\/hp:colSz>/);
    expect(colSzMatch).toBeDefined();
    const widths = colSzMatch![1].split(' ').map(Number);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(42520);
  });
});
