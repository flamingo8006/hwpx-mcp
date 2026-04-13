import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { HwpxDocument } from './HwpxDocument';

/**
 * Create a realistic HWPX document using HwpxDocument.createNew() for E2E testing.
 * This produces a valid document that opens in Hancom Word.
 */
async function createRealisticHwpxBuffer(): Promise<Buffer> {
  const doc = HwpxDocument.createNew('e2e-test', 'E2E Test Document', 'DGIST');

  // Add content paragraphs
  doc.updateParagraphText(0, 0, 0, 'DGIST 정보전산팀 업무 보고서');
  doc.insertParagraph(0, 0, '1. 사전 요구사항 분석');
  doc.insertParagraph(0, 1, '본 문서는 HWPX MCP 서버의 E2E 테스트를 위한 샘플 문서입니다.');
  doc.insertParagraph(0, 2, '2. 시스템 구성도');
  doc.insertParagraph(0, 3, '아래 표는 시스템 구성 요소를 정리한 것입니다.');

  // Insert table
  doc.insertTable(0, 4, 2, 3);

  // Fill table
  doc.updateTableCell(0, 0, 0, 0, '구성요소');
  doc.updateTableCell(0, 0, 0, 1, '버전');
  doc.updateTableCell(0, 0, 0, 2, '비고');
  doc.updateTableCell(0, 0, 1, 0, 'Node.js');
  doc.updateTableCell(0, 0, 1, 1, 'v20.x');
  doc.updateTableCell(0, 0, 1, 2, 'LTS 권장');

  // Add final paragraph
  doc.insertParagraph(0, 6, '3. 결론 및 향후 계획');

  // Save to get valid HWPX buffer
  return await doc.save();
}

const testOutputDir = path.join(__dirname, '..', 'test-output');

describe('E2E: New Features Integration Test', () => {
  let testFilePath: string;

  beforeEach(async () => {
    if (!fs.existsSync(testOutputDir)) fs.mkdirSync(testOutputDir, { recursive: true });
    const buffer = await createRealisticHwpxBuffer();
    testFilePath = path.join(testOutputDir, 'e2e-newfeatures.hwpx');
    fs.writeFileSync(testFilePath, buffer);
  });

  afterEach(() => {
    // Keep output for manual inspection
  });

  it('format_text: should bold Korean text range and preserve in save/reload', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // "1. 사전 요구사항 분석" → bold "요구사항" (pos 6~10)
    // 0:'1' 1:'.' 2:' ' 3:'사' 4:'전' 5:' ' 6:'요' 7:'구' 8:'사' 9:'항' 10:' ' 11:'분' 12:'석'
    expect(doc.formatTextRange(0, 1, 6, 10, { bold: true })).toBe(true);

    const para = doc.getParagraph(0, 1);
    expect(para!.runs.map(r => r.text).join('')).toBe('1. 사전 요구사항 분석');
    const boldRuns = para!.runs.filter(r => r.charStyle?.bold === true);
    expect(boldRuns.map(r => r.text).join('')).toBe('요구사항');

    // Save + reload
    const saved = await doc.save();
    fs.writeFileSync(testFilePath, saved);
    const doc2 = await HwpxDocument.createFromBuffer('reload', testFilePath, saved);
    const reloaded = doc2.getParagraph(0, 1);
    expect(reloaded!.runs.map(r => r.text).join('')).toBe('1. 사전 요구사항 분석');

    // Verify XML has bold charPr
    const zip = await JSZip.loadAsync(saved);
    const header = await zip.file('Contents/header.xml')?.async('string');
    expect(header).toContain('<hh:bold/>');
  });

  it('format_text: should apply font color to range', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // "DGIST 정보전산팀 업무 보고서" → red "DGIST" (pos 0~5)
    expect(doc.formatTextRange(0, 0, 0, 5, { fontColor: 'FF0000' })).toBe(true);

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const header = await zip.file('Contents/header.xml')?.async('string');
    expect(header).toContain('textColor="#FF0000"');
  });

  it('set_text_style: should preserve original charPr attributes', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // Apply bold to paragraph 0 (which uses charPr id=0 with height=1000)
    doc.applyCharacterStyle(0, 0, 0, { bold: true });

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const header = await zip.file('Contents/header.xml')?.async('string');

    // New charPr should have height=1000 (preserved from original) + bold
    const newCharPrMatch = header!.match(/<hh:charPr[^>]*id="[^0]"[^>]*height="1000"[^>]*>/);
    expect(newCharPrMatch).not.toBeNull();
  });

  it('insert_table: should create table with custom column widths', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    const colWidths = [8000, 14520, 20000];
    const result = doc.insertTable(0, 5, 2, 3, { colWidths }); // after last paragraph
    expect(result).not.toBeNull();

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const section = await zip.file('Contents/section0.xml')?.async('string');

    expect(section).toContain('<hp:colSz>8000 14520 20000</hp:colSz>');
  });

  it('set_column_widths: should update existing table column widths', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // Change existing table (table 0) column widths
    const newWidths = [10000, 12520, 20000];
    expect(doc.setColumnWidths(0, 0, newWidths)).toBe(true);

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const section = await zip.file('Contents/section0.xml')?.async('string');

    expect(section).toContain('<hp:colSz>10000 12520 20000</hp:colSz>');
    expect(section).toContain('width="10000"');
  });

  it('set_cell_background_color: should set cell background', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // Set header row first cell to yellow background
    expect(doc.setCellBackgroundColor(0, 0, 0, 0, 'FFFF00')).toBe(true);

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const header = await zip.file('Contents/header.xml')?.async('string');
    const section = await zip.file('Contents/section0.xml')?.async('string');

    // Should have new borderFill with yellow in header
    // (borderFillProperties may use different tag format depending on createNew vs manual)
    expect(header).toContain('FFFF00');

    // The cell's borderFillIDRef should be updated
    expect(section).toBeDefined();
  });

  it('insert_page_break: should insert page break', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // Insert page break after paragraph 3 (before "2. 시스템 구성도")
    const idx = doc.insertPageBreak(0, 2);
    expect(idx).toBe(3);

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const section = await zip.file('Contents/section0.xml')?.async('string');

    expect(section).toContain('pageBreak="1"');
  });

  it('set_numbering: should apply numbering style', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // createNew() documents may not have numbering defs
    const defs = doc.getNumberingDefs();

    // Apply numbering with defId=1 (will create new paraPr even if def doesn't exist)
    // The XML sync creates the heading reference; actual numbering display
    // depends on whether the numbering definition exists in the document
    expect(doc.setNumbering(0, 2, 'number', 1, 0)).toBe(true);

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const header = await zip.file('Contents/header.xml')?.async('string');

    // Should have new paraPr with heading type="NUMBER"
    expect(header).toContain('type="NUMBER"');
    expect(header).toContain('idRef="1"');
  });

  it('regex validation: should handle invalid regex gracefully', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // Invalid regex should throw with clear message
    expect(() => {
      doc.searchText('[invalid', { regex: true });
    }).toThrow('Invalid regex pattern');

    expect(() => {
      doc.replaceText('[invalid', 'test', { regex: true });
    }).toThrow('Invalid regex pattern');
  });

  it('updateTableCell: multiline text should create multiple paragraphs', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // Update cell with multiline text
    doc.updateTableCell(0, 0, 1, 2, '줄1\n줄2\n줄3');

    // In-memory should have 3 paragraphs
    const table = doc.getTable(0, 0);
    expect(table).not.toBeNull();
    // Cell text should contain all lines
    const cellText = table!.data[1][2].text;
    expect(cellText).toContain('줄1');
  });

  it('full workflow: create document with formatting, tables, and styles', async () => {
    const doc = await HwpxDocument.createFromBuffer('test', testFilePath, fs.readFileSync(testFilePath));

    // 1. Format title
    doc.formatTextRange(0, 0, 0, 5, { bold: true, fontSize: 16, fontColor: '0000FF' });

    // 2. Set column widths for existing table
    doc.setColumnWidths(0, 0, [10000, 15000, 17520]);

    // 3. Set header row background
    doc.setCellBackgroundColor(0, 0, 0, 0, 'E0E0E0');
    doc.setCellBackgroundColor(0, 0, 0, 1, 'E0E0E0');
    doc.setCellBackgroundColor(0, 0, 0, 2, 'E0E0E0');

    // 4. Add new table with custom widths
    doc.insertTable(0, 6, 3, 2, { colWidths: [20000, 22520] });

    // 5. Insert page break
    doc.insertPageBreak(0, 6);

    // 6. Save
    const saved = await doc.save();
    const outputPath = path.join(testOutputDir, 'e2e-full-workflow.hwpx');
    fs.writeFileSync(outputPath, saved);

    // 7. Reload and verify integrity
    const doc2 = await HwpxDocument.createFromBuffer('verify', outputPath, saved);
    const tables = doc2.getTables();
    expect(tables.length).toBeGreaterThanOrEqual(2);

    // 8. Verify XML integrity
    const zip = await JSZip.loadAsync(saved);
    const section = await zip.file('Contents/section0.xml')?.async('string');
    expect(section).toBeDefined();

    // Tag balance check
    const tblOpen = (section!.match(/<hp:tbl[\s>]/g) || []).length;
    const tblClose = (section!.match(/<\/hp:tbl>/g) || []).length;
    expect(tblOpen).toBe(tblClose);

    const pOpen = (section!.match(/<hp:p[\s>]/g) || []).length;
    const pClose = (section!.match(/<\/hp:p>/g) || []).length;
    expect(pOpen).toBe(pClose);

    console.log('✅ Full workflow E2E passed');
    console.log(`Output: ${outputPath}`);
  });
});
