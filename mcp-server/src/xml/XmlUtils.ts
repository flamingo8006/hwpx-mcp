/**
 * XML utility functions extracted from HwpxDocument.ts.
 * Pure functions with no external state dependencies.
 */

/**
 * Escape special XML characters in text content.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape special regex characters in a string for use in RegExp constructor.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reset lineseg values to defaults so Hancom Word recalculates line layout.
 * When text content changes, old lineseg values no longer match the new text,
 * causing rendering issues like overlapping text.
 */
export function resetLinesegInXml(xml: string): string {
  const linesegArrayPattern = /(<(?:hp|hs|hc):linesegarray[^>]*>)[\s\S]*?(<\/(?:hp|hs|hc):linesegarray>)/g;

  return xml.replace(linesegArrayPattern, (_match, openTag: string, closeTag: string) => {
    const prefixMatch = openTag.match(/<(hp|hs|hc):linesegarray/);
    const prefix = prefixMatch ? prefixMatch[1] : 'hp';
    const defaultSeg = `<${prefix}:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="0" flags="0"/>`;
    return openTag + defaultSeg + closeTag;
  });
}

export interface TopLevelElement {
  start: number;
  tagLength: number;
  content: string;
  type: 'p' | 'tbl';
}

/**
 * Find all top-level paragraph and table elements in section XML.
 * Uses depth tracking to skip nested elements inside tables, subLists, etc.
 */
export function findTopLevelElements(sectionXml: string): TopLevelElement[] {
  const results: TopLevelElement[] = [];

  const secOpenMatch = sectionXml.match(/<(?:hs|hp):sec[^>]*>/);
  if (!secOpenMatch) return results;
  const bodyStart = secOpenMatch.index! + secOpenMatch[0].length;

  const secCloseIdx = Math.max(
    sectionXml.lastIndexOf('</hs:sec>'),
    sectionXml.lastIndexOf('</hp:sec>')
  );
  const bodyEnd = secCloseIdx === -1 ? sectionXml.length : secCloseIdx;

  let depth = 0;
  let pos = bodyStart;
  const depthTags = ['tbl', 'tc', 'secPr', 'subList'];
  const prefixes = ['hp', 'hs', 'hc'];

  while (pos < bodyEnd) {
    const nextTag = sectionXml.indexOf('<', pos);
    if (nextTag === -1 || nextTag >= bodyEnd) break;

    let isClose = false;
    for (const prefix of prefixes) {
      for (const tag of depthTags) {
        const closeStr = `</${prefix}:${tag}>`;
        if (sectionXml.startsWith(closeStr, nextTag)) {
          depth--;
          pos = nextTag + closeStr.length;
          isClose = true;
          break;
        }
      }
      if (isClose) break;
    }
    if (isClose) continue;

    if (depth === 0) {
      for (const prefix of prefixes) {
        const pOpenStr = `<${prefix}:p `;
        const pOpenSelf = `<${prefix}:p>`;
        if (sectionXml.startsWith(pOpenStr, nextTag) || sectionXml.startsWith(pOpenSelf, nextTag)) {
          const tagEnd = sectionXml.indexOf('>', nextTag);
          if (tagEnd !== -1) {
            const tagContent = sectionXml.substring(nextTag, tagEnd + 1);
            results.push({ start: nextTag, tagLength: tagContent.length, content: tagContent, type: 'p' });
          }
          break;
        }
        const tblOpenStr = `<${prefix}:tbl `;
        const tblOpenSelf = `<${prefix}:tbl>`;
        if (sectionXml.startsWith(tblOpenStr, nextTag) || sectionXml.startsWith(tblOpenSelf, nextTag)) {
          const tagEnd = sectionXml.indexOf('>', nextTag);
          if (tagEnd !== -1) {
            const tagContent = sectionXml.substring(nextTag, tagEnd + 1);
            results.push({ start: nextTag, tagLength: tagContent.length, content: tagContent, type: 'tbl' });
          }
          break;
        }
      }
    }

    let isOpen = false;
    for (const prefix of prefixes) {
      for (const tag of depthTags) {
        const openStr = `<${prefix}:${tag}`;
        if (sectionXml.startsWith(openStr, nextTag)) {
          const afterTag = nextTag + openStr.length;
          if (afterTag < sectionXml.length && (sectionXml[afterTag] === ' ' || sectionXml[afterTag] === '>' || sectionXml[afterTag] === '/')) {
            depth++;
            isOpen = true;
            break;
          }
        }
      }
      if (isOpen) break;
    }

    const tagEndPos = sectionXml.indexOf('>', nextTag);
    pos = tagEndPos !== -1 ? tagEndPos + 1 : nextTag + 1;
  }

  return results;
}

export interface ElementWithPosition {
  xml: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Find all elements of a given type using depth tracking.
 * Correctly handles nested elements (e.g., nested tables).
 * @param xml The XML string to search in
 * @param elementName The element name without namespace prefix (e.g., 'tr', 'tc')
 */
export function findAllElementsWithDepth(xml: string, elementName: string): ElementWithPosition[] {
  const elements: ElementWithPosition[] = [];

  const startPattern = new RegExp(`<(hp|hs|hc):${elementName}[^>]*>`, 'g');
  let match;

  while ((match = startPattern.exec(xml)) !== null) {
    const startIndex = match.index;
    const prefix = match[1];
    const openTag = `<${prefix}:${elementName}`;
    const closeTag = `</${prefix}:${elementName}>`;

    let depth = 1;
    let pos = match.index + match[0].length;

    while (depth > 0 && pos < xml.length) {
      const nextOpen = xml.indexOf(openTag, pos);
      const nextClose = xml.indexOf(closeTag, pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 1;
      } else {
        depth--;
        if (depth === 0) {
          const endIndex = nextClose + closeTag.length;
          elements.push({
            xml: xml.substring(startIndex, endIndex),
            startIndex,
            endIndex
          });
          startPattern.lastIndex = endIndex;
        }
        pos = nextClose + 1;
      }
    }
  }

  return elements;
}
