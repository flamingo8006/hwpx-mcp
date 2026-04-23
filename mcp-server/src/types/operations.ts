/**
 * Pending operation payload types for the save pipeline.
 * Extracted from HwpxDocument.ts to reduce monolith size and improve readability.
 */

import { CharacterStyle, ParagraphStyle } from '../types';
import { ImagePositionOptions } from '../HwpxDocument';

export interface PendingTextReplacement {
  oldText: string;
  newText: string;
  options: { caseSensitive?: boolean; regex?: boolean; replaceAll?: boolean };
}

export interface PendingDirectTextUpdate {
  sectionIndex: number;
  elementIndex: number;
  paragraphId: string;
  paragraphOccurrence: number;
  runIndex: number;
  oldText: string;
  newText: string;
}

export interface PendingTableCellUpdate {
  sectionIndex: number;
  tableIndex: number;
  tableId: string;
  row: number;
  col: number;
  text: string;
  charShapeId?: number;
}

export interface PendingNestedTableInsert {
  sectionIndex: number;
  parentTableIndex: number;
  row: number;
  col: number;
  nestedRows: number;
  nestedCols: number;
  data: string[][];
}

export interface PendingImageInsert {
  sectionIndex: number;
  afterElementIndex: number;
  imageId: string;
  binaryId: string;
  data: string;
  mimeType: string;
  width: number;
  height: number;
  position?: ImagePositionOptions;
  headerText?: string;
}

export interface PendingCellImageInsert {
  sectionIndex: number;
  tableIndex: number;
  row: number;
  col: number;
  imageId: string;
  binaryId: string;
  data: string;
  mimeType: string;
  width: number;
  height: number;
  orgWidth: number;
  orgHeight: number;
  afterText?: string;
}

export interface PendingTableInsert {
  sectionIndex: number;
  afterElementIndex: number;
  rows: number;
  cols: number;
  width: number;
  cellWidth: number;
  colWidths?: number[];
  insertOrder: number;
  tableId: string;
  // Template presets for cell paragraphs (optional) — resolved against the
  // active template profile. headerPreset applies to row 0; bodyPreset to all
  // other rows. When absent, cells fall back to paraPrIDRef="0" charPrIDRef="0".
  headerPreset?: string;
  bodyPreset?: string;
  // Resolved overrides (filled in by the build_document handler once presets
  // are looked up against the active template profile). When present these
  // values are stamped verbatim into `<hp:p>` / `<hp:run>` inside each cell.
  overrideHeaderParaPrIDRef?: string;
  overrideHeaderCharPrIDRef?: string;
  overrideBodyParaPrIDRef?: string;
  overrideBodyCharPrIDRef?: string;
  // Optional explicit borderFillIDRef; defaults to "2" (standard template value).
  borderFillIDRef?: string;
  // Header cell data (row 0) from build_document. When set, the first row is
  // populated with these texts and styled via header presets; subsequent rows
  // use body presets. When omitted (or fewer than cols), empty cells remain.
  headerCells?: string[];
  // Body cell data (rows 1..n-1). Each sub-array is one row of `cols` strings.
  bodyCells?: string[][];
}

export interface PendingImageDelete {
  imageId: string;
  binaryId: string;
}

export interface PendingTableDelete {
  sectionIndex: number;
  tableIndex: number;
  tableId?: string;
}

export interface PendingParagraphDelete {
  sectionIndex: number;
  elementIndex: number;
  elementType: 'paragraph' | 'table';
}

export interface PendingCellMerge {
  sectionIndex: number;
  tableIndex: number;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface PendingCellSplit {
  sectionIndex: number;
  tableIndex: number;
  row: number;
  col: number;
  originalColSpan: number;
  originalRowSpan: number;
}

export interface PendingHangingIndent {
  sectionIndex: number;
  elementIndex: number;
  paragraphId: string;
  /** Zero-based occurrence of paragraphId within the section at call time —
   *  see PendingParagraphStyle. */
  paragraphOccurrence?: number;
  indentPt: number;
}

export interface PendingTableCellHangingIndent {
  sectionIndex: number;
  tableIndex: number;
  row: number;
  col: number;
  paragraphIndex: number;
  paragraphId: string;
  indentPt: number;
}

export interface PendingParagraphInsert {
  sectionIndex: number;
  afterElementIndex: number;
  paragraphId: string;
  text: string;
  pageBreak?: boolean;
  // Inline paragraph style (optional) — avoids separate set_paragraph_style call
  align?: string;
  marginLeft?: number;   // in pt
  marginRight?: number;  // in pt
  lineSpacing?: number;  // in %
  // Inline character style (optional) — avoids separate set_text_style call
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;     // in pt
  fontColor?: string;    // hex
  // Template preset (optional) — resolved against the active template profile
  // to supply paraPrIDRef + charPrIDRef from the document's existing style
  // palette. When preset resolves, inline style fields above are ignored so
  // the paragraph matches the template verbatim.
  preset?: string;
  // Direct style-pointer overrides. When set, the paragraph/run XML uses
  // these IDs verbatim instead of the hardcoded "0" default. Resolved by the
  // build_document handler from `preset` before the insert is queued; callers
  // may also set them directly to bypass the profile layer.
  overrideParaPrIDRef?: string;
  overrideCharPrIDRef?: string;
}

export interface PendingParagraphStyle {
  sectionIndex: number;
  elementIndex: number;
  /** Stable paragraph id captured at call time, used to remap elementIndex
   *  after copies/moves/inserts shift the section layout during save(). */
  paragraphId?: string;
  /** Zero-based occurrence of paragraphId within the section at call time.
   *  Disambiguates duplicate ids (e.g. after copies) so remap lands on the
   *  exact paragraph the caller targeted. */
  paragraphOccurrence?: number;
  style: Partial<ParagraphStyle>;
}

export interface PendingTableCellCharacterStyle {
  sectionIndex: number;
  tableIndex: number;
  row: number;
  col: number;
  paragraphIndex: number;
  runIndex: number;
  style: Partial<CharacterStyle>;
}

export interface PendingCharacterStyle {
  sectionIndex: number;
  elementIndex: number;
  /** Stable paragraph id captured at call time — see PendingParagraphStyle. */
  paragraphId?: string;
  /** Zero-based occurrence of paragraphId within the section at call time —
   *  see PendingParagraphStyle. */
  paragraphOccurrence?: number;
  runIndex: number;
  style: Partial<CharacterStyle>;
}

export interface PendingRunSplit {
  sectionIndex: number;
  elementIndex: number;
  /** Stable paragraph id captured at call time — see PendingParagraphStyle. */
  paragraphId?: string;
  /** Zero-based occurrence of paragraphId within the section at call time —
   *  see PendingParagraphStyle. */
  paragraphOccurrence?: number;
  styledRunIndices: Map<number, Partial<CharacterStyle>>;
}

export interface PendingTableRowInsert {
  sectionIndex: number;
  tableIndex: number;
  afterRowIndex: number;
  cellTexts?: string[];
}

export interface PendingTableRowDelete {
  sectionIndex: number;
  tableIndex: number;
  rowIndex: number;
}

export interface PendingTableColumnInsert {
  sectionIndex: number;
  tableIndex: number;
  afterColIndex: number;
}

export interface PendingTableColumnDelete {
  sectionIndex: number;
  tableIndex: number;
  colIndex: number;
}

export interface PendingParagraphCopy {
  sourceSection: number;
  sourceParagraph: number;
  targetSection: number;
  targetAfter: number;
  /**
   * ID assigned to the newly-cloned in-memory paragraph at call time. Persisted
   * here so applyParagraphCopiesToXml() can locate the correct in-memory clone
   * by ID rather than by `targetAfter + 1`, which is not stable when multiple
   * pending copies share the same `targetAfter` (each successive copy pushes
   * the previous one one slot further down in section.elements).
   */
  cloneId?: string;
}

export interface PendingParagraphMove {
  sourceSection: number;
  sourceParagraph: number;
  targetSection: number;
  targetAfter: number;
}

export interface PendingHeaderFooterUpdate {
  sectionIndex: number;
  text: string;
}

export interface PendingNumberingUpdate {
  sectionIndex: number;
  elementIndex: number;
  paragraphId: string;
  /** Zero-based occurrence of paragraphId within the section at call time —
   *  see PendingParagraphStyle. */
  paragraphOccurrence?: number;
  headingType: 'number' | 'bullet';
  numberingId: number;  // reference to numbering or bullet def in header.xml
  level: number;
}

export interface PendingCellStyleUpdate {
  sectionIndex: number;
  tableIndex: number;
  tableId: string;
  row: number;
  col: number;
  backgroundColor?: string; // hex color e.g. "FFFF00"
}

export interface PendingColumnWidthUpdate {
  sectionIndex: number;
  tableIndex: number;
  tableId: string;
  colWidths: number[]; // hwpunit
}

export interface PendingTableMove {
  type: 'move' | 'copy';
  sourceSectionIndex: number;
  sourceTableIndex: number;
  targetSectionIndex: number;
  targetAfterIndex: number;
}
