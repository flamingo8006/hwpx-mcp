/**
 * Regression test for "header preset downgraded to body" bug.
 *
 * Context: build_document with `header_preset: 'table_header'` but without
 * header text (user intends to fill the header row later via update_table_cell)
 * used to stamp row 0 with BODY paraPrIDRef/charPrIDRef, defeating the whole
 * point of the preset system for table templates.
 *
 * Fix (HwpxDocument.ts, applyPendingInsertsToXml):
 *   hasHeaderRow = hasHeaderPresetIntent || headerCells?.length > 0;
 * Previously it was just `headerCells?.length > 0`.
 *
 * Codex HIGH #2 (2026-04-24).
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { HwpxDocument } from './HwpxDocument';

async function createMinimalDoc(): Promise<HwpxDocument> {
  const zip = new JSZip();

  zip.file('mimetype', 'application/hwp+zip');
  zip.file('Contents/content.hpf', `<?xml version="1.0"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="1.4" unique-identifier="hwpx-id">
  <opf:metadata/>
  <opf:manifest>
    <opf:item id="header" href="header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`);

  zip.file('Contents/header.xml', `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"
         xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"
         version="1.4">
  <hh:refList>
    <hh:fontfaces itemCnt="1">
      <hh:fontface lang="HANGUL" itemCnt="1">
        <hh:font id="0" face="함초롬바탕" type="TTF"/>
      </hh:fontface>
    </hh:fontfaces>
    <hh:charProperties itemCnt="1">
      <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0">
        <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:underline type="NONE" shape="SOLID" color="#000000"/>
        <hh:strikeout shape="NONE" color="#000000"/>
        <hh:outline type="NONE"/>
        <hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>
      </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties itemCnt="1">
      <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
        <hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>
        <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
        <hh:border borderFillIDRef="0" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>
    </hh:paraProperties>
    <hh:borderFills itemCnt="1">
      <hh:borderFill id="0" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
      </hh:borderFill>
    </hh:borderFills>
  </hh:refList>
</hh:head>`);

  zip.file('Contents/section0.xml', `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0"><hp:t/></hp:run>
  </hp:p>
</hs:sec>`);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return HwpxDocument.createFromBuffer('header-preset', '/tmp/test.hwpx', buf);
}

describe('insertTable — header preset even when headerCells is empty', () => {
  it('stamps header preset IDs on row 0 when caller supplies overrideHeaderParaPrIDRef without headerCells', async () => {
    const doc = await createMinimalDoc();

    doc.insertTable(0, 0, 3, 2, {
      colWidths: [20000, 20000],
      overrideHeaderParaPrIDRef: '31', // arbitrary header preset id
      overrideHeaderCharPrIDRef: '29',
      overrideBodyParaPrIDRef: '32',
      overrideBodyCharPrIDRef: '30',
      borderFillIDRef: '10',
      // headerCells intentionally omitted — user will fill via update_table_cell later
      // bodyCells intentionally omitted
    });

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    const tbl = xml.match(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/)?.[0] ?? '';
    expect(tbl).not.toBe('');

    const rows = tbl.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g)!;
    expect(rows.length).toBe(3);

    // Row 0 must use HEADER preset ids (31/29), not BODY ids (32/30).
    const r0 = rows[0];
    expect(r0).toContain('paraPrIDRef="31"');
    expect(r0).toContain('charPrIDRef="29"');

    // Row 1 and 2 must use BODY preset ids.
    expect(rows[1]).toContain('paraPrIDRef="32"');
    expect(rows[1]).toContain('charPrIDRef="30"');
    expect(rows[2]).toContain('paraPrIDRef="32"');
    expect(rows[2]).toContain('charPrIDRef="30"');

    // repeatHeader attribute should reflect the presence of a header row.
    expect(tbl).toMatch(/repeatHeader="1"/);
  });

  it('still recognises a header row when only headerCells is provided (legacy behaviour)', async () => {
    const doc = await createMinimalDoc();

    doc.insertTable(0, 0, 2, 2, {
      colWidths: [20000, 20000],
      overrideBodyParaPrIDRef: '32',
      overrideBodyCharPrIDRef: '30',
      headerCells: ['항목', '값'],
    });

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    const tbl = xml.match(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/)?.[0] ?? '';
    expect(tbl).toMatch(/repeatHeader="1"/);
    expect(tbl).toContain('<hp:t>항목</hp:t>');
  });

  it('keeps row 0 as body when neither header preset intent nor header cells are supplied', async () => {
    const doc = await createMinimalDoc();

    doc.insertTable(0, 0, 2, 2, {
      colWidths: [20000, 20000],
      overrideBodyParaPrIDRef: '32',
      overrideBodyCharPrIDRef: '30',
    });

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    const tbl = xml.match(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/)?.[0] ?? '';
    expect(tbl).toMatch(/repeatHeader="0"/);
    // Every row uses body ids.
    const rows = tbl.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g)!;
    for (const r of rows) {
      expect(r).toContain('paraPrIDRef="32"');
      expect(r).toContain('charPrIDRef="30"');
    }
  });
});
