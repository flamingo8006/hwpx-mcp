import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { HwpxDocument } from './HwpxDocument';

/**
 * Regressions found in real use (2026-10-01):
 *
 * 1. replace_text / batch_replace rewrote <hp:t> text but left the paragraph's
 *    <hp:linesegarray> untouched. When a replacement SHRANK the text so that a
 *    lineseg textpos pointed past the end of the paragraph (e.g. a 71-char,
 *    2-line paragraph → 1 char with linesegs [0, 60]), Hancom Office refused to
 *    open the file ("문서가 손상되었거나 변조되었을 가능성"). Growing
 *    replacements never violated the invariant, so the bug stayed latent.
 *
 * 2. batch_replace reported count ≥ 1 but the saved file kept the old text for
 *    paragraphs whose <hp:t> contains child elements (<hp:lineBreak/>,
 *    <hp:tab/> …). The parser splits those into separate in-memory runs (so the
 *    in-memory match succeeds), while the save-time regex only matched
 *    `<hp:t>[^<]*</hp:t>` and silently skipped them.
 */

const LONG_TEXT = '가'.repeat(71); // 71 chars, laid out by Hancom as 2 lines

function seg(textpos: number, vertpos: number): string {
  return `<hp:lineseg textpos="${textpos}" vertpos="${vertpos}" vertsize="1300" textheight="1300" baseline="1105" spacing="780" horzpos="0" horzsize="42520" flags="393216"/>`;
}

async function buildDoc(): Promise<Buffer> {
  const zip = new JSZip();
  const sectionXml = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
<hp:p id="1" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${LONG_TEXT}</hp:t></hp:run><hp:linesegarray>${seg(0, 0)}${seg(60, 1600)}</hp:linesegarray></hp:p>
<hp:p id="2" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>변경하지 않는 문단</hp:t></hp:run><hp:linesegarray>${seg(0, 3200)}</hp:linesegarray></hp:p>
<hp:p id="3" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:tbl id="100" rowCnt="1" colCnt="1"><hp:tr><hp:tc colAddr="0" rowAddr="0" colSpan="1" rowSpan="1"><hp:subList>
<hp:p id="10" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>CPU : Xeon W-2400 Series</hp:t></hp:run><hp:linesegarray>${seg(0, 0)}</hp:linesegarray></hp:p>
<hp:p id="11" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${LONG_TEXT}</hp:t></hp:run><hp:linesegarray>${seg(0, 1600)}${seg(60, 3200)}</hp:linesegarray></hp:p>
<hp:p id="12" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>Power : 2250W EPA90 Power Supply<hp:lineBreak/>Os : Windows 11 Pro 64 for Workstations 6 Cores Plus</hp:t></hp:run><hp:linesegarray>${seg(0, 4800)}${seg(33, 6400)}</hp:linesegarray></hp:p>
<hp:p id="13" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>RAM<hp:tab width="4000" leader="0" type="1"/>64GB DDR5</hp:t></hp:run><hp:linesegarray>${seg(0, 8000)}</hp:linesegarray></hp:p>
</hp:subList></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run><hp:linesegarray>${seg(0, 4800)}</hp:linesegarray></hp:p>
</hs:sec>`;
  // Mirror Hancom's layout: no directory entries, mimetype/version.xml/preview STORED.
  const noDirs = { createFolders: false };
  zip.file('mimetype', 'application/hwp+zip', { ...noDirs, compression: 'STORE' });
  zip.file('version.xml', '<?xml version="1.0" encoding="UTF-8"?><hv:HCFVersion xmlns:hv="x"/>', { ...noDirs, compression: 'STORE' });
  zip.file('Contents/header.xml', '<?xml version="1.0" encoding="UTF-8"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"></hh:head>', noDirs);
  zip.file('Contents/section0.xml', sectionXml, noDirs);
  zip.file('Preview/PrvImage.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { ...noDirs, compression: 'STORE' });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Walk the section XML and, for every <hp:linesegarray>, pair it with the
 * text length of the paragraph that owns it (nested paragraphs inside tables
 * are tracked with a stack). Child elements such as <hp:tab/> or
 * <hp:lineBreak/> occupy one character position each.
 */
function linesegOwners(xml: string): Array<{ textLen: number; textposes: number[] }> {
  const out: Array<{ textLen: number; textposes: number[] }> = [];
  const stack: number[] = [];
  const re = /<hp:p\b[^>]*>|<\/hp:p>|<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>|<hp:linesegarray>([\s\S]*?)<\/hp:linesegarray>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tok = m[0];
    if (tok.startsWith('</hp:p>')) {
      stack.pop();
    } else if (tok.startsWith('<hp:linesegarray')) {
      const textposes = [...m[2].matchAll(/textpos="(\d+)"/g)].map(x => Number(x[1]));
      out.push({ textLen: stack[stack.length - 1], textposes });
    } else if (tok.startsWith('<hp:t')) {
      const inner = m[1];
      const children = (inner.match(/<[^>]+>/g) || []).length;
      const text = inner.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|apos);/g, '_');
      stack[stack.length - 1] += text.length + children;
    } else {
      stack.push(0);
    }
  }
  return out;
}

function expectLinesegInvariant(xml: string): void {
  for (const { textLen, textposes } of linesegOwners(xml)) {
    const max = Math.max(...textposes);
    // textpos 0 is always valid (even for an empty paragraph); any later
    // line start must point inside the paragraph text.
    if (max > 0) expect(max).toBeLessThan(textLen);
  }
}

async function savedSection(doc: HwpxDocument): Promise<{ buf: Buffer; xml: string }> {
  const buf = await doc.save();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('Contents/section0.xml')!.async('string');
  return { buf, xml };
}

describe('replace_text lineseg invariant (bug 1)', () => {
  it('collapses linesegarray of a shrunk top-level paragraph', async () => {
    const doc = await HwpxDocument.createFromBuffer('a', 't.hwpx', await buildDoc());
    expect(doc.replaceText(LONG_TEXT, ' ')).toBe(2); // top-level + cell paragraph

    const { xml } = await savedSection(doc);
    expectLinesegInvariant(xml);

    // Changed paragraph: single lineseg, textpos=0, first lineseg's metrics kept.
    const p1 = xml.match(/<hp:p id="1"[\s\S]*?<\/hp:p>/)![0];
    expect(p1).toContain('<hp:t> </hp:t>');
    expect((p1.match(/<hp:lineseg\b/g) || []).length).toBe(1);
    expect(p1).toContain('textpos="0" vertpos="0" vertsize="1300"');
  });

  it('collapses the owning cell paragraph only, leaving untouched paragraphs as-is', async () => {
    const doc = await HwpxDocument.createFromBuffer('b', 't.hwpx', await buildDoc());
    doc.replaceText(LONG_TEXT, 'x');
    const { xml } = await savedSection(doc);

    const p11 = xml.match(/<hp:p id="11"[\s\S]*?<\/hp:p>/)![0];
    expect((p11.match(/<hp:lineseg\b/g) || []).length).toBe(1);

    // Unchanged paragraphs keep their original linesegs verbatim.
    const p12 = xml.match(/<hp:p id="12"[\s\S]*?<\/hp:p>/)![0];
    expect(p12).toContain(seg(33, 6400));
    const p2 = xml.match(/<hp:p id="2"[\s\S]*?<\/hp:p>/)![0];
    expect(p2).toContain(seg(0, 3200));
    // The outer paragraph hosting the table was not itself changed.
    expect(xml).toContain(`<hp:t/></hp:run><hp:linesegarray>${seg(0, 4800)}</hp:linesegarray>`);
    expectLinesegInvariant(xml);
  });

  it('holds the invariant after shrinking a paragraph that contains a lineBreak', async () => {
    const doc = await HwpxDocument.createFromBuffer('c', 't.hwpx', await buildDoc());
    doc.replaceText('Os : Windows 11 Pro 64 for Workstations 6 Cores Plus', '');
    doc.replaceText('Power : 2250W EPA90 Power Supply', 'P');
    const { xml } = await savedSection(doc);
    expectLinesegInvariant(xml);
  });
});

describe('batch_replace silently dropped replacements (bug 2)', () => {
  const REPLACEMENTS: Array<[string, string]> = [
    ['CPU : Xeon W-2400 Series', 'CPU : Xeon W-3400 Series'],
    ['Power : 2250W EPA90 Power Supply', 'Power : 1400W Power Supply'],
    ['Os : Windows 11 Pro 64 for Workstations 6 Cores Plus', 'Os : Windows 11 Pro 64'],
    ['64GB DDR5', '128GB DDR5'],
  ];

  it('persists every replacement that reported success, including <hp:t> with child elements', async () => {
    const doc = await HwpxDocument.createFromBuffer('d', 't.hwpx', await buildDoc());
    for (const [oldText, newText] of REPLACEMENTS) {
      expect(doc.replaceText(oldText, newText)).toBe(1);
    }

    const { buf, xml } = await savedSection(doc);
    for (const [oldText, newText] of REPLACEMENTS) {
      expect(xml).not.toContain(oldText);
      expect(xml).toContain(newText);
    }
    // Child elements survive the rewrite.
    expect(xml).toContain('Power : 1400W Power Supply<hp:lineBreak/>Os : Windows 11 Pro 64</hp:t>');
    expect(xml).toContain('RAM<hp:tab width="4000" leader="0" type="1"/>128GB DDR5</hp:t>');

    // Reload agrees with what was reported in memory.
    const reloaded = await HwpxDocument.createFromBuffer('d2', 't.hwpx', buf);
    const cellText = reloaded.getTableCell(0, 0, 0, 0)!.text;
    for (const [oldText, newText] of REPLACEMENTS) {
      expect(cellText).not.toContain(oldText);
      expect(cellText).toContain(newText);
    }
    expectLinesegInvariant(xml);
  });

  it('does not double-escape untouched entities in the same <hp:t>', async () => {
    const doc = await HwpxDocument.createFromBuffer('e', 't.hwpx', await buildDoc());
    doc.replaceText('RAM', 'R&D');
    const { xml } = await savedSection(doc);
    expect(xml).toContain('R&amp;D<hp:tab');
  });
});

describe('save-time replacement mirrors in-memory semantics', () => {
  async function docWith(tContent: string): Promise<HwpxDocument> {
    const zip = new JSZip();
    zip.file('Contents/header.xml', '<hh:head xmlns:hh="h"></hh:head>', { createFolders: false });
    zip.file('Contents/section0.xml', `<hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p id="1"><hp:run charPrIDRef="0"><hp:t>${tContent}</hp:t></hp:run><hp:linesegarray>${seg(0, 0)}</hp:linesegarray></hp:p></hs:sec>`, { createFolders: false });
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    return HwpxDocument.createFromBuffer('m', 't.hwpx', buf);
  }

  it('leaves numeric entities undecoded, like the parser', async () => {
    const doc = await docWith('&#65;');
    expect(doc.replaceText('&#65;', 'REPLACED')).toBe(1);
    const { xml } = await savedSection(doc);
    expect(xml).toContain('<hp:t>REPLACED</hp:t>');
  });

  it('applies empty-matching regex to an entirely empty <hp:t>', async () => {
    const doc = await docWith('');
    expect(doc.replaceText('^', 'REPLACED', { regex: true })).toBe(1);
    const { xml } = await savedSection(doc);
    expect(xml).toContain('<hp:t>REPLACED</hp:t>');
  });
});

describe('save() zip packaging preserves original container layout', () => {
  it('forces mimetype to STORE even when the original deflated it', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { createFolders: false, compression: 'DEFLATE' });
    zip.file('Contents/header.xml', '<hh:head xmlns:hh="h"></hh:head>', { createFolders: false });
    zip.file('Contents/section0.xml', '<hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p id="1"><hp:run><hp:t>a</hp:t></hp:run></hp:p></hs:sec>', { createFolders: false });
    const doc = await HwpxDocument.createFromBuffer('g', 't.hwpx', await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    const after = await JSZip.loadAsync(await doc.save());
    expect((after.files['mimetype'] as any)._data.compression.magic).toBe('\x00\x00');
  });

  it('keeps entry order and per-entry compression, adds no directory entries', async () => {
    const original = await buildDoc();
    const doc = await HwpxDocument.createFromBuffer('f', 't.hwpx', original);
    doc.replaceText('CPU', 'GPU');
    const saved = await doc.save();

    const before = await JSZip.loadAsync(original);
    const after = await JSZip.loadAsync(saved);
    const names = (z: JSZip) => Object.keys(z.files);
    expect(names(before).some(n => n.endsWith('/'))).toBe(false);
    expect(names(after)).toEqual(names(before));

    const method = (z: JSZip, n: string) => (z.files[n] as any)._data.compression.magic;
    for (const n of names(before)) {
      expect(method(after, n)).toBe(method(before, n));
    }
  });
});
