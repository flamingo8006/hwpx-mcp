import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { HwpxDocument } from './HwpxDocument';

/**
 * Build a minimal HWPX buffer whose Contents/header.xml satisfies every
 * gongmun_v1 assertion. section0.xml contains a single empty paragraph so
 * insertParagraph / insertTable have somewhere to anchor.
 */
async function buildGongmunLikeBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:fontface lang="HANGUL">
    <hh:font id="3" face="휴먼고딕"/>
    <hh:font id="4" face="휴먼명조"/>
    <hh:font id="5" face="HY헤드라인M"/>
    <hh:font id="6" face="한양중고딕"/>
  </hh:fontface>
  <hh:charPr id="0" height="1000"><hh:fontRef hangul="4"/></hh:charPr>
  <hh:charPr id="7" height="1200"><hh:fontRef hangul="3"/></hh:charPr>
  <hh:charPr id="8" height="1500"><hh:fontRef hangul="5"/></hh:charPr>
  <hh:charPr id="16" height="2000"><hh:fontRef hangul="5"/></hh:charPr>
  <hh:charPr id="18" height="1300"><hh:fontRef hangul="6"/></hh:charPr>
  <hh:charPr id="20" height="1500"><hh:fontRef hangul="4"/></hh:charPr>
  <hh:charPr id="21" height="1500"><hh:fontRef hangul="4"/></hh:charPr>
  <hh:charPr id="22" height="1300"><hh:fontRef hangul="4"/></hh:charPr>
  <hh:charPr id="23" height="1300"><hh:fontRef hangul="6"/></hh:charPr>
  <hh:charPr id="26" height="1200"><hh:fontRef hangul="6"/><hh:bold/></hh:charPr>
  <hh:charPr id="27" height="1000"><hh:fontRef hangul="6"/></hh:charPr>
  <hh:charPr id="29" height="1200"><hh:fontRef hangul="6"/><hh:bold/></hh:charPr>
  <hh:charPr id="30" height="1200"><hh:fontRef hangul="6"/></hh:charPr>
  <hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
  <hh:paraPr id="12"><hh:align horizontal="CENTER"/></hh:paraPr>
  <hh:paraPr id="21"><hh:align horizontal="RIGHT"/></hh:paraPr>
  <hh:paraPr id="22"><hh:align horizontal="JUSTIFY"/><hh:lineSpacing type="PERCENT" value="165"/></hh:paraPr>
  <hh:paraPr id="24"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
  <hh:paraPr id="25"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
  <hh:paraPr id="26"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
  <hh:paraPr id="27"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
  <hh:paraPr id="28"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
  <hh:paraPr id="29"><hh:align horizontal="LEFT"/></hh:paraPr>
  <hh:paraPr id="30"><hh:align horizontal="RIGHT"/></hh:paraPr>
  <hh:paraPr id="31"><hh:align horizontal="CENTER"/><hh:lineSpacing type="PERCENT" value="130"/></hh:paraPr>
  <hh:paraPr id="32"><hh:align horizontal="JUSTIFY"/><hh:lineSpacing type="PERCENT" value="130"/></hh:paraPr>
  <hh:borderFill id="2"/>
</hh:head>`;

  const sectionXml = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="0"><hp:t>anchor</hp:t></hp:run>
  </hp:p>
</hs:sec>`;

  const contentTypesXml = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`;

  zip.file('Contents/header.xml', headerXml);
  zip.file('Contents/section0.xml', sectionXml);
  zip.file('[Content_Types].xml', contentTypesXml);

  return await zip.generateAsync({ type: 'nodebuffer' });
}

describe('Template preset insertion (gongmun_v1)', () => {
  let tmpPath: string;

  beforeEach(async () => {
    const buf = await buildGongmunLikeBuffer();
    tmpPath = path.join(__dirname, '..', 'test-temp-preset.hwpx');
    fs.writeFileSync(tmpPath, buf);
  });

  it('insertParagraph with preset overrides stamps the given paraPrIDRef + charPrIDRef', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('t1', tmpPath, buf);

    // Mimic what the build_document handler does after resolving preset "heading":
    // overrideParaPrIDRef="22", overrideCharPrIDRef="8" (per GONGMUN_V1).
    const idx = doc.insertParagraph(0, 0, '□ 대분류 제목', undefined, {
      overrideParaPrIDRef: '22',
      overrideCharPrIDRef: '8',
      preset: 'heading',
    });
    expect(idx).toBeGreaterThan(0);

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    // New paragraph must carry the preset-resolved pointers verbatim.
    expect(xml).toMatch(/<hp:p\s+id="[^"]+"\s+paraPrIDRef="22"[^>]*>\s*<hp:run\s+charPrIDRef="8">/);
    // And none of the inline-char-style fallback — no freshly-minted charPr entries.
    const headerXml = await z.file('Contents/header.xml')!.async('string');
    // charPr id=8 already existed; no new clone should be appended.
    const newCharPrMatch = headerXml.match(/<hh:charPr\s+id="(\d+)"/g) || [];
    const ids = new Set(newCharPrMatch.map(s => s.match(/id="(\d+)"/)![1]));
    expect(ids.has('8')).toBe(true); // unchanged
  });

  it('insertParagraph without preset override falls back to paraPrIDRef="0" (legacy)', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('t2', tmpPath, buf);

    const idx = doc.insertParagraph(0, 0, 'plain paragraph');
    expect(idx).toBeGreaterThan(0);

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    // No override → paraPrIDRef="0" (legacy behavior).
    expect(xml).toMatch(/<hp:p\s+id="[^"]+"\s+paraPrIDRef="0"[^>]*>\s*<hp:run\s+charPrIDRef="0">/);
    expect(xml).toContain('plain paragraph');
  });

  it('insertTable with header/body preset overrides stamps preset pointers into every cell', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('t3', tmpPath, buf);

    const res = doc.insertTable(0, 0, 3, 3, {
      colWidths: [8000, 16000, 18520],
      overrideHeaderParaPrIDRef: '31',
      overrideHeaderCharPrIDRef: '29',
      overrideBodyParaPrIDRef: '32',
      overrideBodyCharPrIDRef: '30',
      borderFillIDRef: '2',
      headerPreset: 'table_header',
      bodyPreset: 'table_body',
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

    // Three rows of three cells.
    const trCount = (xml.match(/<hp:tr>/g) || []).length;
    expect(trCount).toBe(3);

    // Row 0 cells: header preset pair (31/29) + header cell text.
    const headerRowMatch = xml.match(/<hp:tr>[\s\S]*?<\/hp:tr>/);
    expect(headerRowMatch).not.toBeNull();
    const headerRow = headerRowMatch![0];
    expect(headerRow).toContain('paraPrIDRef="31"');
    expect(headerRow).toContain('charPrIDRef="29"');
    expect(headerRow).toContain('차수');
    expect(headerRow).toContain('교육 주제');
    expect(headerRow).toContain('시간·정원');

    // Row 1+ cells: body preset pair (32/30) + body text.
    const allRows = xml.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g)!;
    const bodyRow = allRows[1];
    expect(bodyRow).toContain('paraPrIDRef="32"');
    expect(bodyRow).toContain('charPrIDRef="30"');
    expect(bodyRow).toContain('1차');
    expect(bodyRow).toContain('AI 기초');
  });

  it('getHeaderXml() returns Contents/header.xml verbatim', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('t4', tmpPath, buf);

    const header = await doc.getHeaderXml();
    expect(header).toBeDefined();
    expect(header).toContain('face="HY헤드라인M"');
    expect(header).toContain('<hh:charPr id="16"');
  });

  it('insertTable per-row borderFillIDRef: header row gets override, body rows get body override', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('t-borderfill', tmpPath, buf);

    doc.insertTable(0, 0, 3, 2, {
      overrideHeaderParaPrIDRef: '31',
      overrideHeaderCharPrIDRef: '29',
      overrideBodyParaPrIDRef: '32',
      overrideBodyCharPrIDRef: '30',
      overrideHeaderBorderFillIDRef: '10', // gray-fill header
      overrideBodyBorderFillIDRef: '9',    // white body
      headerPreset: 'table_header',
      bodyPreset: 'table_body',
      headerCells: ['구분', '값'],
      bodyCells: [
        ['행1', '데이터1'],
        ['행2', '데이터2'],
      ],
    });

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    const rows = xml.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g)!;
    expect(rows.length).toBe(3);

    // Row 0 (header) — every <hp:tc> must carry borderFillIDRef="10".
    const headerTcMatches = rows[0].match(/<hp:tc[^>]*borderFillIDRef="(\d+)"/g)!;
    for (const tc of headerTcMatches) {
      expect(tc).toContain('borderFillIDRef="10"');
    }

    // Rows 1..2 (body) — every <hp:tc> must carry borderFillIDRef="9".
    for (let r = 1; r < rows.length; r++) {
      const bodyTcMatches = rows[r].match(/<hp:tc[^>]*borderFillIDRef="(\d+)"/g)!;
      for (const tc of bodyTcMatches) {
        expect(tc).toContain('borderFillIDRef="9"');
      }
    }

    // Table-level borderFillIDRef should fall back to the body value so that
    // newly-inserted rows inherit the plain-white fill.
    const tblMatch = xml.match(/<hp:tbl[^>]*borderFillIDRef="(\d+)"/)!;
    expect(tblMatch[1]).toBe('9');
  });

  it('insertTable without per-row overrides applies the uniform borderFillIDRef to every cell', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('t-uniform', tmpPath, buf);

    doc.insertTable(0, 0, 2, 2, {
      borderFillIDRef: '2',
      headerCells: ['H1', 'H2'],
      bodyCells: [['B1', 'B2']],
    });

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    const allTc = xml.match(/<hp:tc[^>]*borderFillIDRef="(\d+)"/g)!;
    expect(allTc.length).toBe(4);
    for (const tc of allTc) {
      expect(tc).toContain('borderFillIDRef="2"');
    }
  });

  it('in-memory grid reflects headerCells/bodyCells before save', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('t5', tmpPath, buf);

    doc.insertTable(0, 0, 2, 2, {
      headerCells: ['H1', 'H2'],
      bodyCells: [['B11', 'B12']],
    });

    const t = doc.getTable(0, 0)!;
    expect(t.data[0][0].text).toBe('H1');
    expect(t.data[0][1].text).toBe('H2');
    expect(t.data[1][0].text).toBe('B11');
    expect(t.data[1][1].text).toBe('B12');
  });
});
