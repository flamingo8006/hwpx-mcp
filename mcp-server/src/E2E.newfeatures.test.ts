import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { HwpxDocument } from './HwpxDocument';

/**
 * Create a realistic HWPX document with proper header.xml for E2E testing.
 * Includes charPr, paraPr, borderFill, numbering, and fontface definitions.
 */
async function createRealisticHwpxBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"
         xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:docInfo>
    <hh:title>E2E Test Document</hh:title>
  </hh:docInfo>
  <hh:fontfaces>
    <hh:fontface lang="HANGUL">
      <hh:font id="0" face="함초롬바탕" type="TTF"/>
      <hh:font id="1" face="맑은 고딕" type="TTF"/>
    </hh:fontface>
    <hh:fontface lang="LATIN">
      <hh:font id="0" face="함초롬바탕" type="TTF"/>
      <hh:font id="1" face="맑은 고딕" type="TTF"/>
    </hh:fontface>
    <hh:fontface lang="HANJA">
      <hh:font id="0" face="함초롬바탕" type="TTF"/>
    </hh:fontface>
    <hh:fontface lang="JAPANESE">
      <hh:font id="0" face="함초롬바탕" type="TTF"/>
    </hh:fontface>
    <hh:fontface lang="OTHER">
      <hh:font id="0" face="함초롬바탕" type="TTF"/>
    </hh:fontface>
    <hh:fontface lang="SYMBOL">
      <hh:font id="0" face="함초롬바탕" type="TTF"/>
    </hh:fontface>
    <hh:fontface lang="USER">
      <hh:font id="0" face="함초롬바탕" type="TTF"/>
    </hh:fontface>
  </hh:fontfaces>
  <hh:charProperties itemCnt="2">
    <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    </hh:charPr>
    <hh:charPr id="1" height="1400" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:bold/>
    </hh:charPr>
  </hh:charProperties>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="0" tabPrIDRef="0">
      <hh:align horizontal="LEFT" vertical="BASELINE"/>
    </hh:paraPr>
  </hh:paraProperties>
  <hh:borderFillProperties itemCnt="2">
    <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
      <hh:leftBorder type="NONE" width="0.12mm" color="#000000"/>
      <hh:rightBorder type="NONE" width="0.12mm" color="#000000"/>
      <hh:topBorder type="NONE" width="0.12mm" color="#000000"/>
      <hh:bottomBorder type="NONE" width="0.12mm" color="#000000"/>
    </hh:borderFill>
    <hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
      <hh:leftBorder type="SOLID" width="0.12mm" color="#000000"/>
      <hh:rightBorder type="SOLID" width="0.12mm" color="#000000"/>
      <hh:topBorder type="SOLID" width="0.12mm" color="#000000"/>
      <hh:bottomBorder type="SOLID" width="0.12mm" color="#000000"/>
    </hh:borderFill>
  </hh:borderFillProperties>
  <hh:numberings>
    <hh:numbering id="1" start="1">
      <hh:paraHead level="0" numFormat="DIGIT">%1.</hh:paraHead>
      <hh:paraHead level="1" numFormat="HANGUL_SYLLABLE">%2.</hh:paraHead>
    </hh:numbering>
  </hh:numberings>
  <hh:bullets>
    <hh:bullet id="1" char="●"/>
  </hh:bullets>
</hh:head>`;

  const sectionXml = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>DGIST 정보전산팀 업무 보고서</hp:t></hp:run>
  </hp:p>
  <hp:p id="2" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>1. 사전 요구사항 분석</hp:t></hp:run>
  </hp:p>
  <hp:p id="3" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>본 문서는 HWPX MCP 서버의 E2E 테스트를 위한 샘플 문서입니다.</hp:t></hp:run>
  </hp:p>
  <hp:p id="4" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>2. 시스템 구성도</hp:t></hp:run>
  </hp:p>
  <hp:p id="5" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>아래 표는 시스템 구성 요소를 정리한 것입니다.</hp:t></hp:run>
  </hp:p>
  <hp:tbl id="100" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="2" colCnt="3" cellSpacing="0" borderFillIDRef="2" noAdjust="0">
    <hp:sz width="42520" widthRelTo="ABSOLUTE" height="2000" heightRelTo="ABSOLUTE" protect="0"/>
    <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>
    <hp:outMargin left="141" right="141" top="141" bottom="141"/>
    <hp:inMargin left="0" right="0" top="0" bottom="0"/>
    <hp:tr>
      <hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">
        <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">
          <hp:p id="10" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="0"><hp:t>구성요소</hp:t></hp:run>
          </hp:p>
        </hp:subList>
        <hp:cellAddr colAddr="0" rowAddr="0"/>
        <hp:cellSpan colSpan="1" rowSpan="1"/>
        <hp:cellSz width="14173" height="1000"/>
        <hp:cellMargin left="141" right="141" top="141" bottom="141"/>
      </hp:tc>
      <hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">
        <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">
          <hp:p id="11" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="0"><hp:t>버전</hp:t></hp:run>
          </hp:p>
        </hp:subList>
        <hp:cellAddr colAddr="1" rowAddr="0"/>
        <hp:cellSpan colSpan="1" rowSpan="1"/>
        <hp:cellSz width="14173" height="1000"/>
        <hp:cellMargin left="141" right="141" top="141" bottom="141"/>
      </hp:tc>
      <hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">
        <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">
          <hp:p id="12" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="0"><hp:t>비고</hp:t></hp:run>
          </hp:p>
        </hp:subList>
        <hp:cellAddr colAddr="2" rowAddr="0"/>
        <hp:cellSpan colSpan="1" rowSpan="1"/>
        <hp:cellSz width="14174" height="1000"/>
        <hp:cellMargin left="141" right="141" top="141" bottom="141"/>
      </hp:tc>
    </hp:tr>
    <hp:tr>
      <hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">
        <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">
          <hp:p id="20" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="0"><hp:t>Node.js</hp:t></hp:run>
          </hp:p>
        </hp:subList>
        <hp:cellAddr colAddr="0" rowAddr="1"/>
        <hp:cellSpan colSpan="1" rowSpan="1"/>
        <hp:cellSz width="14173" height="1000"/>
        <hp:cellMargin left="141" right="141" top="141" bottom="141"/>
      </hp:tc>
      <hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">
        <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">
          <hp:p id="21" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="0"><hp:t>v20.x</hp:t></hp:run>
          </hp:p>
        </hp:subList>
        <hp:cellAddr colAddr="1" rowAddr="1"/>
        <hp:cellSpan colSpan="1" rowSpan="1"/>
        <hp:cellSz width="14173" height="1000"/>
        <hp:cellMargin left="141" right="141" top="141" bottom="141"/>
      </hp:tc>
      <hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">
        <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">
          <hp:p id="22" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="0"><hp:t>LTS 권장</hp:t></hp:run>
          </hp:p>
        </hp:subList>
        <hp:cellAddr colAddr="2" rowAddr="1"/>
        <hp:cellSpan colSpan="1" rowSpan="1"/>
        <hp:cellSz width="14174" height="1000"/>
        <hp:cellMargin left="141" right="141" top="141" bottom="141"/>
      </hp:tc>
    </hp:tr>
    <hp:colSz>14173 14173 14174</hp:colSz>
  </hp:tbl>
  <hp:p id="6" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t>3. 결론 및 향후 계획</hp:t></hp:run>
  </hp:p>
</hs:sec>`;

  zip.file('mimetype', 'application/hwp+zip');
  zip.file('Contents/header.xml', headerXml);
  zip.file('Contents/section0.xml', sectionXml);
  zip.file('Contents/content.hpf', '<pkg/>');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);

  return await zip.generateAsync({ type: 'nodebuffer' });
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

    // Set header row cells to yellow background
    expect(doc.setCellBackgroundColor(0, 0, 0, 0, 'FFFF00')).toBe(true);
    expect(doc.setCellBackgroundColor(0, 0, 0, 1, 'FFFF00')).toBe(true);
    expect(doc.setCellBackgroundColor(0, 0, 0, 2, 'FFFF00')).toBe(true);

    const saved = await doc.save();
    const zip = await JSZip.loadAsync(saved);
    const header = await zip.file('Contents/header.xml')?.async('string');

    // Should have new borderFill with yellow
    expect(header).toContain('faceColor="#FFFF00"');
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

    // Get numbering defs
    const defs = doc.getNumberingDefs();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].id).toBe(1);

    // Apply numbering to paragraph 2
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
