import { describe, it, expect } from 'vitest';
import {
  getTemplateProfile,
  listTemplateProfiles,
  verifyProfileAgainstHeader,
  resolveParagraphPreset,
  resolveTableCellPreset,
  computeStylePaletteFingerprint,
} from './TemplateProfiles';

// Minimal header.xml fragment that satisfies every gongmun_v1 assertion.
// Constructed to mirror the on-disk 공문서_프레임.hwpx style palette for the
// assertion-relevant charPr / paraPr / borderFill ids. Each stanza is the
// smallest thing that makes the assertion pass — real templates carry many
// more attributes. Coverage must stay exhaustive (kept in lockstep with
// GONGMUN_V1.assertions in TemplateProfiles.ts).
const GOOD_HEADER = `<?xml version="1.0"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:fontface lang="HANGUL">
    <hh:font id="3" face="휴먼고딕"/>
    <hh:font id="4" face="휴먼명조"/>
    <hh:font id="5" face="HY헤드라인M"/>
    <hh:font id="6" face="한양중고딕"/>
  </hh:fontface>
  <hh:charPr id="7" height="1200">
    <hh:fontRef hangul="3"/>
  </hh:charPr>
  <hh:charPr id="8" height="1500">
    <hh:fontRef hangul="5"/>
  </hh:charPr>
  <hh:charPr id="16" height="2000">
    <hh:fontRef hangul="5"/>
  </hh:charPr>
  <hh:charPr id="18" height="1300">
    <hh:fontRef hangul="6"/>
  </hh:charPr>
  <hh:charPr id="20" height="1500">
    <hh:fontRef hangul="4"/>
  </hh:charPr>
  <hh:charPr id="21" height="1500">
    <hh:fontRef hangul="4"/>
  </hh:charPr>
  <hh:charPr id="22" height="1300">
    <hh:fontRef hangul="4"/>
  </hh:charPr>
  <hh:charPr id="23" height="1300">
    <hh:fontRef hangul="6"/>
  </hh:charPr>
  <hh:charPr id="26" height="1200">
    <hh:fontRef hangul="6"/>
    <hh:bold/>
  </hh:charPr>
  <hh:charPr id="27" height="1000">
    <hh:fontRef hangul="6"/>
  </hh:charPr>
  <hh:charPr id="29" height="1200">
    <hh:fontRef hangul="6"/>
    <hh:bold/>
  </hh:charPr>
  <hh:charPr id="30" height="1200">
    <hh:fontRef hangul="6"/>
  </hh:charPr>
  <hh:paraPr id="12">
    <hh:align horizontal="CENTER"/>
    <hh:lineSpacing type="PERCENT" value="120"/>
  </hh:paraPr>
  <hh:paraPr id="21">
    <hh:align horizontal="RIGHT"/>
    <hh:lineSpacing type="PERCENT" value="165"/>
  </hh:paraPr>
  <hh:paraPr id="22">
    <hh:align horizontal="JUSTIFY"/>
    <hh:lineSpacing type="PERCENT" value="165"/>
  </hh:paraPr>
  <hh:paraPr id="24">
    <hh:align horizontal="JUSTIFY"/>
    <hh:lineSpacing type="PERCENT" value="145"/>
  </hh:paraPr>
  <hh:paraPr id="25">
    <hh:align horizontal="JUSTIFY"/>
    <hh:lineSpacing type="PERCENT" value="160"/>
  </hh:paraPr>
  <hh:paraPr id="26">
    <hh:align horizontal="JUSTIFY"/>
    <hh:lineSpacing type="PERCENT" value="160"/>
  </hh:paraPr>
  <hh:paraPr id="27">
    <hh:align horizontal="JUSTIFY"/>
    <hh:lineSpacing type="PERCENT" value="160"/>
  </hh:paraPr>
  <hh:paraPr id="28">
    <hh:align horizontal="JUSTIFY"/>
    <hh:lineSpacing type="PERCENT" value="160"/>
  </hh:paraPr>
  <hh:paraPr id="29">
    <hh:align horizontal="LEFT"/>
    <hh:lineSpacing type="PERCENT" value="160"/>
  </hh:paraPr>
  <hh:paraPr id="30">
    <hh:align horizontal="RIGHT"/>
    <hh:lineSpacing type="PERCENT" value="160"/>
  </hh:paraPr>
  <hh:paraPr id="31">
    <hh:align horizontal="CENTER"/>
    <hh:lineSpacing type="PERCENT" value="130"/>
  </hh:paraPr>
  <hh:paraPr id="32">
    <hh:align horizontal="JUSTIFY"/>
    <hh:lineSpacing type="PERCENT" value="130"/>
  </hh:paraPr>
  <hh:borderFill id="9">
    <hh:leftBorder type="SOLID" width="0.12 mm"/>
    <hh:rightBorder type="SOLID" width="0.12 mm"/>
    <hh:topBorder type="SOLID" width="0.12 mm"/>
    <hh:bottomBorder type="SOLID" width="0.12 mm"/>
  </hh:borderFill>
  <hh:borderFill id="10">
    <hh:leftBorder type="SOLID" width="0.12 mm"/>
    <hh:rightBorder type="SOLID" width="0.12 mm"/>
    <hh:topBorder type="SOLID" width="0.12 mm"/>
    <hh:bottomBorder type="SOLID" width="0.12 mm"/>
    <hc:winBrush faceColor="#E5E5E5"/>
  </hh:borderFill>
</hh:head>`;

describe('TemplateProfiles', () => {
  describe('registry', () => {
    it('returns gongmun_v1 by name', () => {
      const p = getTemplateProfile('gongmun_v1');
      expect(p).toBeDefined();
      expect(p!.name).toBe('gongmun_v1');
    });

    it('returns undefined for unknown profile', () => {
      expect(getTemplateProfile('does-not-exist')).toBeUndefined();
    });

    it('listTemplateProfiles returns every registered profile', () => {
      const names = listTemplateProfiles().map(p => p.name);
      expect(names).toContain('gongmun_v1');
    });

    it('gongmun_v1 exposes documented paragraph presets', () => {
      const p = getTemplateProfile('gongmun_v1')!;
      for (const name of ['title', 'date', 'summary', 'heading', 'point', 'detail', 'subdetail', 'footnote', 'table_title', 'table_unit', 'table_note']) {
        const preset = resolveParagraphPreset(p, name);
        expect(preset, `preset ${name}`).toBeDefined();
        expect(preset!.paraPrIDRef).toMatch(/^\d+$/);
        expect(preset!.charPrIDRef).toMatch(/^\d+$/);
      }
    });

    it('gongmun_v1 exposes table cell presets', () => {
      const p = getTemplateProfile('gongmun_v1')!;
      expect(resolveTableCellPreset(p, 'table_header')).toBeDefined();
      expect(resolveTableCellPreset(p, 'table_body')).toBeDefined();
      expect(resolveTableCellPreset(p, 'nope')).toBeUndefined();
    });
  });

  describe('verifyProfileAgainstHeader (fail-closed)', () => {
    const profile = getTemplateProfile('gongmun_v1')!;

    it('passes against a header matching every assertion', () => {
      const res = verifyProfileAgainstHeader(profile, GOOD_HEADER);
      expect(res.failures).toEqual([]);
      expect(res.ok).toBe(true);
    });

    it('reports a failure when a charPr font size is wrong', () => {
      const broken = GOOD_HEADER.replace('id="16" height="2000"', 'id="16" height="1800"');
      const res = verifyProfileAgainstHeader(profile, broken);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes('charPr[16].height'))).toBe(true);
    });

    it('reports a failure when a charPr is absent', () => {
      const broken = GOOD_HEADER.replace(/<hh:charPr id="8"[\s\S]*?<\/hh:charPr>/, '');
      const res = verifyProfileAgainstHeader(profile, broken);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes('charPr id=8 not found'))).toBe(true);
    });

    it('reports a failure when paraPr alignment changes', () => {
      const broken = GOOD_HEADER.replace(
        /<hh:paraPr id="31">[\s\S]*?<\/hh:paraPr>/,
        '<hh:paraPr id="31"><hh:align horizontal="LEFT"/><hh:lineSpacing type="PERCENT" value="130"/></hh:paraPr>',
      );
      const res = verifyProfileAgainstHeader(profile, broken);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes('paraPr[31].align'))).toBe(true);
    });

    it('reports a failure when the hangul font face does not match', () => {
      const broken = GOOD_HEADER.replace('id="5" face="HY헤드라인M"', 'id="5" face="NotHY"');
      const res = verifyProfileAgainstHeader(profile, broken);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes('hangulFontFace'))).toBe(true);
    });

    it('reports bold mismatch on charPr', () => {
      // charPr id=29 expects bold=true; stripping the <hh:bold/> should fail.
      const broken = GOOD_HEADER.replace(
        /<hh:charPr id="29"[\s\S]*?<\/hh:charPr>/,
        '<hh:charPr id="29" height="1200"><hh:fontRef hangul="6"/></hh:charPr>',
      );
      const res = verifyProfileAgainstHeader(profile, broken);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes('charPr[29].bold'))).toBe(true);
    });
  });

  describe('computeStylePaletteFingerprint', () => {
    it('is stable across identical palettes', () => {
      const a = computeStylePaletteFingerprint(GOOD_HEADER);
      const b = computeStylePaletteFingerprint(GOOD_HEADER);
      expect(a).toBe(b);
      expect(a).toMatch(/^sha256:[a-f0-9]{32}$/);
    });

    it('changes when a charPr height changes', () => {
      const base = computeStylePaletteFingerprint(GOOD_HEADER);
      const mutated = computeStylePaletteFingerprint(
        GOOD_HEADER.replace('id="16" height="2000"', 'id="16" height="1900"'),
      );
      expect(mutated).not.toBe(base);
    });

    it('changes when fontface entries change', () => {
      const base = computeStylePaletteFingerprint(GOOD_HEADER);
      const mutated = computeStylePaletteFingerprint(
        GOOD_HEADER.replace('face="HY헤드라인M"', 'face="OtherFont"'),
      );
      expect(mutated).not.toBe(base);
    });
  });
});
