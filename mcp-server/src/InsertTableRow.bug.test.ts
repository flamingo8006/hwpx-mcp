import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { HwpxDocument } from './HwpxDocument';

/**
 * Regression: `insert_table_row` used to emit malformed XML when the template
 * row's cells contained self-closing `<hp:t/>` tags. The old regex ran global
 * iteration over `<hp:t>` tokens, so cellTexts[0] landed in whichever cell
 * matched first — and a self-closing `<hp:t/>` wasn't normalized, silently
 * skipping that cell's text injection. The fix normalizes the template row
 * first, then walks cell-by-cell injecting into each cell's leading `<hp:t>`.
 */
async function buildRowBugBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  const headerXml = `<?xml version="1.0"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:charPr id="0" height="1000"/>
  <hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
  <hh:borderFill id="2"/>
</hh:head>`;

  // Single-row table with self-closing <hp:t/> in all three cells — the exact
  // shape that triggered the malformed-XML bug before the fix.
  const sectionXml = `<?xml version="1.0"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="0"><hp:t>top</hp:t></hp:run>
  </hp:p>
  <hp:tbl id="T1" rowCnt="1" colCnt="3" borderFillIDRef="2">
    <hp:tr>
      <hp:tc colAddr="0" rowAddr="0" colSpan="1" rowSpan="1">
        <hp:subList>
          <hp:p id="10" paraPrIDRef="0" styleIDRef="0">
            <hp:run charPrIDRef="0"><hp:t/></hp:run>
          </hp:p>
        </hp:subList>
      </hp:tc>
      <hp:tc colAddr="1" rowAddr="0" colSpan="1" rowSpan="1">
        <hp:subList>
          <hp:p id="11" paraPrIDRef="0" styleIDRef="0">
            <hp:run charPrIDRef="0"><hp:t/></hp:run>
          </hp:p>
        </hp:subList>
      </hp:tc>
      <hp:tc colAddr="2" rowAddr="0" colSpan="1" rowSpan="1">
        <hp:subList>
          <hp:p id="12" paraPrIDRef="0" styleIDRef="0">
            <hp:run charPrIDRef="0"><hp:t/></hp:run>
          </hp:p>
        </hp:subList>
      </hp:tc>
    </hp:tr>
  </hp:tbl>
</hs:sec>`;

  const contentTypesXml = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`;

  zip.file('Contents/header.xml', headerXml);
  zip.file('Contents/section0.xml', sectionXml);
  zip.file('[Content_Types].xml', contentTypesXml);

  return await zip.generateAsync({ type: 'nodebuffer' });
}

describe('insertTableRow — self-closing <hp:t/> regression', () => {
  let tmpPath: string;

  beforeEach(async () => {
    const buf = await buildRowBugBuffer();
    tmpPath = path.join(__dirname, '..', 'test-temp-row-bug.hwpx');
    fs.writeFileSync(tmpPath, buf);
  });

  it('inserts cellTexts into the correct cells when template row uses <hp:t/>', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('row-bug', tmpPath, buf);

    const ok = doc.insertTableRow(0, 0, 0, ['A-0', 'A-1', 'A-2']);
    expect(ok).toBe(true);

    const saved = await doc.save();
    const z = await JSZip.loadAsync(saved);
    const xml = await z.file('Contents/section0.xml')!.async('string');

    // Two rows after the insert: the original (empty text cells) and the new row.
    const rows = xml.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g)!;
    expect(rows.length).toBe(2);

    const newRow = rows[1];
    // Each cellTexts[i] must land in cell i, exactly once.
    expect((newRow.match(/A-0/g) || []).length).toBe(1);
    expect((newRow.match(/A-1/g) || []).length).toBe(1);
    expect((newRow.match(/A-2/g) || []).length).toBe(1);

    // Cells in the new row in order: cell 0 contains A-0, cell 1 contains A-1, etc.
    const cells = newRow.match(/<hp:tc[\s\S]*?<\/hp:tc>/g)!;
    expect(cells.length).toBe(3);
    expect(cells[0]).toContain('A-0');
    expect(cells[0]).not.toContain('A-1');
    expect(cells[1]).toContain('A-1');
    expect(cells[1]).not.toContain('A-0');
    expect(cells[2]).toContain('A-2');
    expect(cells[2]).not.toContain('A-1');

    // rowCnt attribute must increment.
    expect(xml).toMatch(/rowCnt="2"/);
  });

  it('re-parses the saved document and reads each new cell back correctly', async () => {
    const buf = fs.readFileSync(tmpPath);
    const doc = await HwpxDocument.createFromBuffer('row-bug2', tmpPath, buf);
    doc.insertTableRow(0, 0, 0, ['RT1', 'RT2', 'RT3']);
    const saved = await doc.save();

    const reloaded = await HwpxDocument.createFromBuffer('row-bug2b', tmpPath, saved);
    const t = reloaded.getTable(0, 0)!;
    expect(t.rows).toBe(2);
    expect(t.cols).toBe(3);
    expect(t.data[1][0].text).toBe('RT1');
    expect(t.data[1][1].text).toBe('RT2');
    expect(t.data[1][2].text).toBe('RT3');
  });
});
