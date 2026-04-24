/**
 * Unit tests for `verifyProfileAgainstHeader` — the fail-closed guard that
 * rejects preset resolution against a document whose style palette does not
 * match the registered profile.
 *
 * These tests run without the real template file so they are exercised in
 * every CI run, including environments where
 * ~/Documents/skills/templates/공문서_프레임.hwpx is absent. They cover:
 *
 *   1. Assertions are EXHAUSTIVE — every paraPrIDRef/charPrIDRef/borderFillIDRef
 *      referenced by a preset must also be pinned by an assertion (Codex HIGH
 *      #1, 2026-04-24).
 *   2. A minimal synthesized header.xml that matches the assertion values
 *      verifies successfully.
 *   3. A single-field mismatch (e.g. wrong font face) causes verification to
 *      fail with a descriptive failure message.
 *   4. A header missing an asserted id causes verification to fail.
 */
import { describe, it, expect } from 'vitest';
import {
  getTemplateProfile,
  listTemplateProfiles,
  verifyProfileAgainstHeader,
  type TemplateProfile,
} from './TemplateProfiles';

function collectReferencedIds(p: TemplateProfile): {
  paraPr: Set<string>;
  charPr: Set<string>;
  borderFill: Set<string>;
} {
  const paraPr = new Set<string>();
  const charPr = new Set<string>();
  const borderFill = new Set<string>();
  for (const preset of Object.values(p.presets)) {
    paraPr.add(preset.paraPrIDRef);
    charPr.add(preset.charPrIDRef);
  }
  for (const cell of Object.values(p.tableCellPresets)) {
    paraPr.add(cell.paraPrIDRef);
    charPr.add(cell.charPrIDRef);
    if (cell.borderFillIDRef) borderFill.add(cell.borderFillIDRef);
  }
  return { paraPr, charPr, borderFill };
}

function collectAssertedIds(p: TemplateProfile): {
  paraPr: Set<string>;
  charPr: Set<string>;
  borderFill: Set<string>;
} {
  const paraPr = new Set<string>();
  const charPr = new Set<string>();
  const borderFill = new Set<string>();
  for (const a of p.assertions) {
    if (a.kind === 'paraPr') paraPr.add(a.id);
    else if (a.kind === 'charPr') charPr.add(a.id);
    else if (a.kind === 'borderFill') borderFill.add(a.id);
  }
  return { paraPr, charPr, borderFill };
}

describe('TemplateProfile — assertion coverage invariant', () => {
  it.each(listTemplateProfiles().map(p => [p.name, p]))(
    '%s: every referenced id is asserted',
    (_name, profile) => {
      const referenced = collectReferencedIds(profile);
      const asserted = collectAssertedIds(profile);

      const missingParaPr = [...referenced.paraPr].filter(id => !asserted.paraPr.has(id));
      const missingCharPr = [...referenced.charPr].filter(id => !asserted.charPr.has(id));
      const missingBorderFill = [...referenced.borderFill].filter(
        id => !asserted.borderFill.has(id),
      );

      // Produce a helpful failure message.
      const problems: string[] = [];
      if (missingParaPr.length) problems.push(`paraPr ids without assertions: ${missingParaPr.join(', ')}`);
      if (missingCharPr.length) problems.push(`charPr ids without assertions: ${missingCharPr.join(', ')}`);
      if (missingBorderFill.length)
        problems.push(`borderFill ids without assertions: ${missingBorderFill.join(', ')}`);

      expect(problems, problems.join('\n')).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Synthetic header.xml builder — each test constructs a minimal header that
// satisfies every gongmun_v1 assertion, then tweaks one assertion target to
// demonstrate the failure mode.
// ---------------------------------------------------------------------------

function buildSyntheticGongmunHeader(overrides?: {
  charPrOverrides?: Record<string, { height?: string; hangulFontId?: string; bold?: boolean }>;
  paraPrOverrides?: Record<string, { align?: string; lineSpacing?: string }>;
  borderFillOverrides?: Record<
    string,
    { leftBorderType?: string; leftBorderWidth?: string; winBrushFaceColor?: string | null }
  >;
  omit?: { charPr?: string[]; paraPr?: string[]; borderFill?: string[] };
}): string {
  // Font face mapping matching the real 공문서_프레임.hwpx template.
  const fontfaces = `<hh:fontface lang="HANGUL" itemCnt="7">
    <hh:font id="3" face="휴먼고딕" type="TTF"/>
    <hh:font id="4" face="휴먼명조" type="TTF"/>
    <hh:font id="5" face="HY헤드라인M" type="TTF"/>
    <hh:font id="6" face="한양중고딕" type="TTF"/>
  </hh:fontface>`;

  // Default expected values from TemplateProfiles.ts gongmun_v1 assertions.
  const charPrExpected: Record<string, { height: string; hangulFontId: string; bold: boolean }> = {
    '7':  { height: '1200', hangulFontId: '3', bold: false }, // 휴먼고딕
    '8':  { height: '1500', hangulFontId: '5', bold: false }, // HY헤드라인M
    '16': { height: '2000', hangulFontId: '5', bold: false },
    '18': { height: '1300', hangulFontId: '6', bold: false }, // 한양중고딕
    '20': { height: '1500', hangulFontId: '4', bold: false }, // 휴먼명조
    '21': { height: '1500', hangulFontId: '4', bold: false },
    '22': { height: '1300', hangulFontId: '4', bold: false },
    '23': { height: '1300', hangulFontId: '6', bold: false },
    '26': { height: '1200', hangulFontId: '6', bold: true  },
    '27': { height: '1000', hangulFontId: '6', bold: false },
    '29': { height: '1200', hangulFontId: '6', bold: true  },
    '30': { height: '1200', hangulFontId: '6', bold: false },
  };

  const paraPrExpected: Record<string, { align: string; lineSpacing: string }> = {
    '12': { align: 'CENTER',  lineSpacing: '120' },
    '21': { align: 'RIGHT',   lineSpacing: '165' },
    '22': { align: 'JUSTIFY', lineSpacing: '165' },
    '24': { align: 'JUSTIFY', lineSpacing: '145' },
    '25': { align: 'JUSTIFY', lineSpacing: '160' },
    '26': { align: 'JUSTIFY', lineSpacing: '160' },
    '27': { align: 'JUSTIFY', lineSpacing: '160' },
    '28': { align: 'JUSTIFY', lineSpacing: '160' },
    '29': { align: 'LEFT',    lineSpacing: '160' },
    '30': { align: 'RIGHT',   lineSpacing: '160' },
    '31': { align: 'CENTER',  lineSpacing: '130' },
    '32': { align: 'JUSTIFY', lineSpacing: '130' },
  };

  const borderFillExpected: Record<
    string,
    { leftBorderType: string; leftBorderWidth: string; winBrushFaceColor: string | null }
  > = {
    '9':  { leftBorderType: 'SOLID', leftBorderWidth: '0.12 mm', winBrushFaceColor: null },
    '10': { leftBorderType: 'SOLID', leftBorderWidth: '0.12 mm', winBrushFaceColor: '#E5E5E5' },
  };

  // Apply overrides.
  for (const [id, ov] of Object.entries(overrides?.charPrOverrides ?? {})) {
    charPrExpected[id] = { ...charPrExpected[id], ...ov };
  }
  for (const [id, ov] of Object.entries(overrides?.paraPrOverrides ?? {})) {
    paraPrExpected[id] = { ...paraPrExpected[id], ...ov };
  }
  for (const [id, ov] of Object.entries(overrides?.borderFillOverrides ?? {})) {
    const next = { ...borderFillExpected[id] };
    if (ov.leftBorderType !== undefined) next.leftBorderType = ov.leftBorderType;
    if (ov.leftBorderWidth !== undefined) next.leftBorderWidth = ov.leftBorderWidth;
    if (ov.winBrushFaceColor !== undefined) next.winBrushFaceColor = ov.winBrushFaceColor;
    borderFillExpected[id] = next;
  }

  const omitCharPr = new Set(overrides?.omit?.charPr ?? []);
  const omitParaPr = new Set(overrides?.omit?.paraPr ?? []);
  const omitBorderFill = new Set(overrides?.omit?.borderFill ?? []);

  const charPrs = Object.entries(charPrExpected)
    .filter(([id]) => !omitCharPr.has(id))
    .map(
      ([id, v]) => `<hh:charPr id="${id}" height="${v.height}" textColor="#000000">
  <hh:fontRef hangul="${v.hangulFontId}" latin="${v.hangulFontId}" hanja="${v.hangulFontId}" japanese="${v.hangulFontId}" other="${v.hangulFontId}" symbol="${v.hangulFontId}" user="${v.hangulFontId}"/>
  ${v.bold ? '<hh:bold/>' : ''}
</hh:charPr>`,
    )
    .join('\n');

  const paraPrs = Object.entries(paraPrExpected)
    .filter(([id]) => !omitParaPr.has(id))
    .map(
      ([id, v]) => `<hh:paraPr id="${id}">
  <hh:align horizontal="${v.align}" vertical="BASELINE"/>
  <hh:lineSpacing type="PERCENT" value="${v.lineSpacing}" unit="HWPUNIT"/>
</hh:paraPr>`,
    )
    .join('\n');

  const borderFills = Object.entries(borderFillExpected)
    .filter(([id]) => !omitBorderFill.has(id))
    .map(
      ([id, v]) => `<hh:borderFill id="${id}" threeD="0" shadow="0">
  <hh:leftBorder type="${v.leftBorderType}" width="${v.leftBorderWidth}" color="#000000"/>
  <hh:rightBorder type="${v.leftBorderType}" width="${v.leftBorderWidth}" color="#000000"/>
  <hh:topBorder type="${v.leftBorderType}" width="${v.leftBorderWidth}" color="#000000"/>
  <hh:bottomBorder type="${v.leftBorderType}" width="${v.leftBorderWidth}" color="#000000"/>
  ${v.winBrushFaceColor
      ? `<hc:fillBrush><hc:winBrush faceColor="${v.winBrushFaceColor}" hatchColor="#000000" alpha="0"/></hc:fillBrush>`
      : ''}
</hh:borderFill>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"
         xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:refList>
    <hh:fontfaces itemCnt="1">${fontfaces}</hh:fontfaces>
    <hh:charProperties>${charPrs}</hh:charProperties>
    <hh:paraProperties>${paraPrs}</hh:paraProperties>
    <hh:borderFills>${borderFills}</hh:borderFills>
  </hh:refList>
</hh:head>`;
}

describe('verifyProfileAgainstHeader — gongmun_v1 (synthetic header)', () => {
  const profile = getTemplateProfile('gongmun_v1')!;

  it('passes on a synthetic header that matches every assertion', () => {
    const xml = buildSyntheticGongmunHeader();
    const result = verifyProfileAgainstHeader(profile, xml);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when a charPr font-face drifts (e.g. table_header font changed)', () => {
    const xml = buildSyntheticGongmunHeader({
      charPrOverrides: { '29': { hangulFontId: '3' /* 휴먼고딕 instead of 한양중고딕 */ } },
    });
    const result = verifyProfileAgainstHeader(profile, xml);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/charPr\[29\]\.hangulFontFace/);
  });

  it('fails when a paraPr line-spacing drifts', () => {
    const xml = buildSyntheticGongmunHeader({
      paraPrOverrides: { '22': { lineSpacing: '150' /* expected 165 */ } },
    });
    const result = verifyProfileAgainstHeader(profile, xml);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/paraPr\[22\]\.lineSpacing/);
  });

  it('fails when borderFill 10 is missing its gray winBrush', () => {
    const xml = buildSyntheticGongmunHeader({
      borderFillOverrides: { '10': { winBrushFaceColor: null /* no fill */ } },
    });
    const result = verifyProfileAgainstHeader(profile, xml);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/borderFill\[10\]\.winBrush\.faceColor/);
  });

  it('fails when borderFill 9 is missing entirely', () => {
    const xml = buildSyntheticGongmunHeader({ omit: { borderFill: ['9'] } });
    const result = verifyProfileAgainstHeader(profile, xml);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/borderFill id=9 not found/);
  });

  it('fails when a charPr is missing entirely', () => {
    const xml = buildSyntheticGongmunHeader({ omit: { charPr: ['8'] } });
    const result = verifyProfileAgainstHeader(profile, xml);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/charPr id=8 not found/);
  });
});
