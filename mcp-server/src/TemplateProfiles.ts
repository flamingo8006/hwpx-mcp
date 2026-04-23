/**
 * Template profiles map human-friendly preset names (e.g. "heading",
 * "table_header") to paraPrIDRef / charPrIDRef values that already exist in a
 * specific template's header.xml. Callers of build_document can reference
 * presets instead of providing inline styles, which preserves the template's
 * exact styling (fonts, colors, hanging indents, etc.) without a post-
 * processing pass.
 *
 * Safety: every profile carries a short list of "assertions" — expected
 * (paraPrIDRef, font_size_hundredths, hangul_font_face_id) tuples — used to
 * verify that the opened document actually matches the profile before preset
 * resolution. If the assertions fail we refuse to resolve, so a preset call
 * against an unrelated document can never silently corrupt styling.
 */

import * as crypto from 'crypto';

export interface StylePresetEntry {
  /** paraPrIDRef to stamp onto `<hp:p>` */
  paraPrIDRef: string;
  /** charPrIDRef to stamp onto the paragraph's leading `<hp:run>` */
  charPrIDRef: string;
  /** Short human description for error messages and tool discovery */
  description?: string;
}

export interface TableCellPresetEntry {
  paraPrIDRef: string;
  charPrIDRef: string;
  /** Optional borderFillIDRef override for the cell's `<hp:tc>`. */
  borderFillIDRef?: string;
  description?: string;
}

export interface StylePaletteAssertion {
  /** Kind of entry being asserted. */
  kind: 'charPr' | 'paraPr';
  /** The id attribute value to look up. */
  id: string;
  /** Partial match: any field listed must equal the extracted value. */
  expect: {
    /** For charPr: height attribute value (hwpunit; pt × 100). */
    height?: string;
    /** For charPr: face name recorded in fontface/<hh:font face=".."/>
     *  for the hangul font id referenced by this charPr. */
    hangulFontFace?: string;
    /** For charPr: bold presence. */
    bold?: boolean;
    /** For paraPr: horizontal alignment enum value. */
    align?: string;
    /** For paraPr: line spacing value (100 = 1.0×). */
    lineSpacingValue?: string;
  };
}

export interface TemplateProfile {
  /** Stable identifier used in build_document.template_profile. */
  name: string;
  /** Short description for tool-listing/introspection. */
  description?: string;
  /** Preset name -> paragraph/run style pointer. */
  presets: Record<string, StylePresetEntry>;
  /** Table cell style presets (used by build_document table elements). */
  tableCellPresets: Record<string, TableCellPresetEntry>;
  /**
   * Lightweight fingerprint assertions validated against the opened document's
   * header.xml before any preset is resolved. All listed tuples must match;
   * otherwise preset resolution errors out (fail closed).
   */
  assertions: StylePaletteAssertion[];
}

// ---------------------------------------------------------------------------
// gongmun_v1 — DGIST 공문서_프레임.hwpx (stamped 2026-04-23)
// ---------------------------------------------------------------------------
// Verified against the frame template's Contents/header.xml via
// scripts/inspect-template.py. Font ids refer to entries in <hh:fontface
// lang="HANGUL">:
//   font[3] 휴먼고딕, font[4] 휴먼명조, font[5] HY헤드라인M, font[6] 한양중고딕
// ---------------------------------------------------------------------------

const GONGMUN_V1: TemplateProfile = {
  name: 'gongmun_v1',
  description:
    'DGIST 공문서_프레임.hwpx — 제목/날짜/개요 + ◻︎/ㅇ/-/ㆍ/* 본문 5계층 + 표 스타일.',
  presets: {
    // Heading block (decorative title cell)
    title:            { paraPrIDRef: '12', charPrIDRef: '16', description: '문서 제목 HY헤드라인M 20pt center #0E1C2C' },
    date:             { paraPrIDRef: '21', charPrIDRef: '7',  description: '날짜·부서 우측정렬 12pt 휴먼고딕' },
    summary:          { paraPrIDRef: '24', charPrIDRef: '18', description: '개요 박스 내부 한양중고딕 13pt' },

    // Body hierarchy — symbols are typed by the caller (□ / ㅇ / - / ㆍ / *)
    heading:          { paraPrIDRef: '22', charPrIDRef: '8',  description: '□ 대분류 15pt HY헤드라인M (165% line-spacing)' },
    point:            { paraPrIDRef: '25', charPrIDRef: '20', description: 'ㅇ 중분류 15pt 휴먼명조' },
    detail:           { paraPrIDRef: '26', charPrIDRef: '21', description: '- 소분류 15pt 휴먼명조' },
    subdetail:        { paraPrIDRef: '27', charPrIDRef: '22', description: 'ㆍ 세부 13pt 휴먼명조' },
    footnote:         { paraPrIDRef: '28', charPrIDRef: '23', description: '* 각주 13pt 한양중고딕' },

    // Table captions and notes (paragraph-level, outside the table grid)
    table_title:      { paraPrIDRef: '29', charPrIDRef: '26', description: '<표 제목> 12pt 한양중고딕 BOLD 왼쪽정렬' },
    table_unit:       { paraPrIDRef: '30', charPrIDRef: '27', description: '(단위/기준일) 우측정렬 10pt' },
    table_note:       { paraPrIDRef: '29', charPrIDRef: '27', description: '주: 표 주석 10pt 왼쪽정렬' },
  },
  tableCellPresets: {
    table_header: {
      paraPrIDRef: '31',
      charPrIDRef: '29',
      borderFillIDRef: '2',
      description: '표 헤더 중앙정렬 12pt BOLD (130% line-spacing)',
    },
    table_body: {
      paraPrIDRef: '32',
      charPrIDRef: '30',
      borderFillIDRef: '2',
      description: '표 본문 양쪽정렬 12pt (130% line-spacing)',
    },
  },
  assertions: [
    // Title block
    { kind: 'charPr', id: '16', expect: { height: '2000', hangulFontFace: 'HY헤드라인M' } },
    { kind: 'paraPr', id: '12', expect: { align: 'CENTER' } },
    // Body hierarchy
    { kind: 'charPr', id: '8',  expect: { height: '1500', hangulFontFace: 'HY헤드라인M' } },
    { kind: 'paraPr', id: '22', expect: { align: 'JUSTIFY', lineSpacingValue: '165' } },
    { kind: 'charPr', id: '20', expect: { height: '1500', hangulFontFace: '휴먼명조' } },
    { kind: 'charPr', id: '22', expect: { height: '1300', hangulFontFace: '휴먼명조' } },
    // Table cell blocks
    { kind: 'charPr', id: '29', expect: { height: '1200', hangulFontFace: '한양중고딕', bold: true } },
    { kind: 'charPr', id: '30', expect: { height: '1200', hangulFontFace: '한양중고딕' } },
    { kind: 'paraPr', id: '31', expect: { align: 'CENTER', lineSpacingValue: '130' } },
    { kind: 'paraPr', id: '32', expect: { align: 'JUSTIFY', lineSpacingValue: '130' } },
  ],
};

const PROFILES: Record<string, TemplateProfile> = {
  gongmun_v1: GONGMUN_V1,
};

/** Look up a profile by name, or `undefined` if not registered. */
export function getTemplateProfile(name: string): TemplateProfile | undefined {
  return PROFILES[name];
}

/** Enumerate all registered profile names (for discovery). */
export function listTemplateProfiles(): TemplateProfile[] {
  return Object.values(PROFILES);
}

// ---------------------------------------------------------------------------
// Fingerprint + assertion verification
// ---------------------------------------------------------------------------

/**
 * Compute a short stable digest of the style-palette subset of the document's
 * header.xml. We hash only the elements that affect styling (not ui-layout
 * miscellany) so that trivial edits to the template's description text or
 * paper-size metadata don't invalidate the fingerprint.
 */
export function computeStylePaletteFingerprint(headerXml: string): string {
  // Extract <hh:charPr>, <hh:paraPr>, <hh:borderFill>, <hh:style>, <hh:fontface>
  // as the authoritative style palette subset.
  const parts: string[] = [];
  const add = (re: RegExp) => {
    let m;
    while ((m = re.exec(headerXml)) !== null) parts.push(m[0]);
  };
  add(/<hh:charPr\s+[^>]*>[\s\S]*?<\/hh:charPr>/g);
  add(/<hh:paraPr\s+[^>]*>[\s\S]*?<\/hh:paraPr>/g);
  add(/<hh:borderFill\s+[^>]*>[\s\S]*?<\/hh:borderFill>/g);
  add(/<hh:style\s+[^/>]*\/>/g);
  add(/<hh:fontface[\s\S]*?<\/hh:fontface>/g);
  const concatenated = parts.join('');
  return 'sha256:' + crypto.createHash('sha256').update(concatenated).digest('hex').slice(0, 32);
}

export interface ProfileAssertionResult {
  ok: boolean;
  failures: string[];
}

/**
 * Validate that every assertion in `profile.assertions` holds against the
 * given header.xml. Returns the list of failures (empty = all good). Never
 * throws; caller decides how to react (we want fail-closed, so callers should
 * reject preset resolution if !ok).
 */
export function verifyProfileAgainstHeader(
  profile: TemplateProfile,
  headerXml: string,
): ProfileAssertionResult {
  const failures: string[] = [];

  // Build font-id -> face name index from the hangul <hh:fontface> block.
  const fontFaceById = new Map<string, string>();
  const fontfaceMatch = headerXml.match(
    /<hh:fontface[^>]*lang="HANGUL"[^>]*>[\s\S]*?<\/hh:fontface>/,
  );
  if (fontfaceMatch) {
    const faceRe = /<hh:font\s+id="(\d+)"\s+face="([^"]*)"/g;
    let fm;
    while ((fm = faceRe.exec(fontfaceMatch[0])) !== null) {
      fontFaceById.set(fm[1], fm[2]);
    }
  }

  for (const a of profile.assertions) {
    if (a.kind === 'charPr') {
      const re = new RegExp(
        `<hh:charPr\\s+id="${a.id}"\\s+height="(\\d+)"[^>]*>([\\s\\S]*?)</hh:charPr>`,
      );
      const m = headerXml.match(re);
      if (!m) {
        failures.push(`charPr id=${a.id} not found in header.xml`);
        continue;
      }
      const [, height, body] = m;
      if (a.expect.height !== undefined && a.expect.height !== height) {
        failures.push(`charPr[${a.id}].height: expected ${a.expect.height}, got ${height}`);
      }
      if (a.expect.bold !== undefined) {
        const hasBold = /<hh:bold/.test(body);
        if (a.expect.bold !== hasBold) {
          failures.push(`charPr[${a.id}].bold: expected ${a.expect.bold}, got ${hasBold}`);
        }
      }
      if (a.expect.hangulFontFace !== undefined) {
        const fref = body.match(/<hh:fontRef\s+hangul="(\d+)"/);
        const fid = fref ? fref[1] : undefined;
        const face = fid !== undefined ? fontFaceById.get(fid) : undefined;
        if (face !== a.expect.hangulFontFace) {
          failures.push(
            `charPr[${a.id}].hangulFontFace: expected ${a.expect.hangulFontFace}, got ${face ?? '(none)'}`,
          );
        }
      }
    } else if (a.kind === 'paraPr') {
      const re = new RegExp(
        `<hh:paraPr\\s+id="${a.id}"[^>]*>([\\s\\S]*?)</hh:paraPr>`,
      );
      const m = headerXml.match(re);
      if (!m) {
        failures.push(`paraPr id=${a.id} not found in header.xml`);
        continue;
      }
      const body = m[1];
      if (a.expect.align !== undefined) {
        const am = body.match(/horizontal="([^"]+)"/);
        const got = am ? am[1] : undefined;
        if (got !== a.expect.align) {
          failures.push(`paraPr[${a.id}].align: expected ${a.expect.align}, got ${got ?? '(none)'}`);
        }
      }
      if (a.expect.lineSpacingValue !== undefined) {
        const lm = body.match(/<hh:lineSpacing\s+[^>]*value="(\d+)"/);
        const got = lm ? lm[1] : undefined;
        if (got !== a.expect.lineSpacingValue) {
          failures.push(
            `paraPr[${a.id}].lineSpacing: expected ${a.expect.lineSpacingValue}, got ${got ?? '(none)'}`,
          );
        }
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Convenience: resolve a paragraph preset against a validated profile.
 * Returns undefined when the preset name is unknown; caller decides whether to
 * fail loudly or fall back to inline styles.
 */
export function resolveParagraphPreset(
  profile: TemplateProfile,
  presetName: string,
): StylePresetEntry | undefined {
  return profile.presets[presetName];
}

/** Same as above for table cell presets. */
export function resolveTableCellPreset(
  profile: TemplateProfile,
  presetName: string,
): TableCellPresetEntry | undefined {
  return profile.tableCellPresets[presetName];
}
