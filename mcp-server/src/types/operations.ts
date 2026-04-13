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
}

export interface PendingParagraphStyle {
  sectionIndex: number;
  elementIndex: number;
  style: Partial<ParagraphStyle>;
}

export interface PendingCharacterStyle {
  sectionIndex: number;
  elementIndex: number;
  runIndex: number;
  style: Partial<CharacterStyle>;
}

export interface PendingRunSplit {
  sectionIndex: number;
  elementIndex: number;
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
