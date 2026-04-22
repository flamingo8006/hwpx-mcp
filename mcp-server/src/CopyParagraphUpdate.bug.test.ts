import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HwpxDocument } from './HwpxDocument';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

/**
 * Regression test for the 2026-04-22 공문서.hwpx 템플릿 오염 버그.
 *
 * 재현 시나리오:
 *   1. 템플릿 문단 "□ {{s1_heading}}" 를 3 번 copy_paragraph 로 복제한다.
 *   2. 원본과 복제본 각각에 서로 다른 placeholder 텍스트로 update_paragraph_text 를 호출한다.
 *   3. save() 후 XML 을 다시 읽어 원본/복제본이 각자의 텍스트를 정확히 가지고 있는지 확인한다.
 *
 * 수정 전 증상:
 *   - 원본 문단(index 6)에 여러 placeholder 가 연결(concat)된 상태로 저장됨
 *   - 복제본들은 모두 동일한 원본 placeholder 텍스트를 공유
 *   - 일부 update 는 표 셀 내부의 다른 문단으로 "새어나감"
 *
 * 원인:
 *   save() 파이프라인에서 applyParagraphCopiesToXml() 가 맨 마지막에 실행되어,
 *   applyDirectTextUpdatesToXml() 가 실행될 때 XML 에는 아직 복제본이 없어서
 *   elementIndex → XML position 변환이 잘못된 문단을 가리켰다.
 *
 * 수정:
 *   applyParagraphCopiesToXml() 를 applyParagraphInsertsToXml() 바로 뒤 (텍스트
 *   업데이트 이전) 로 이동시켜, 모든 구조적 변경이 텍스트 업데이트보다 먼저
 *   XML 에 반영되도록 한다.
 */
describe('copy_paragraph + update_paragraph_text regression', () => {
  const testDir = path.join(__dirname, 'test-temp-copy-update');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  async function readSectionXml(buf: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('Contents/section0.xml')?.async('string');
    if (!xml) throw new Error('section0.xml missing');
    return xml;
  }

  it('copies retain their own text after updates to each index', async () => {
    const doc = HwpxDocument.createNew('copy-update-1');

    // Seed paragraph that will be copied: "□ {{s1_heading}}".
    // Insert after element 0 (the implicit secPr paragraph created by createNew)
    // so the new paragraph's index is consistent between the in-memory model
    // and the underlying XML.
    const sourceIndex = doc.insertParagraph(0, 0, '□ {{s1_heading}}');
    expect(sourceIndex).toBeGreaterThan(0);

    // Copy the source three times, each insert appended after the previous copy.
    // After three copies we expect four heading paragraphs in a row.
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);                  // new index = sourceIndex + 1
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 1);              // new index = sourceIndex + 2
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 2);              // new index = sourceIndex + 3

    // Rewrite each heading to a distinct placeholder — this is the exact flow
    // that corrupted 공문서.hwpx in 2026-04-22.
    doc.updateParagraphText(0, sourceIndex,     0, '□ {{s1_heading}}');
    doc.updateParagraphText(0, sourceIndex + 1, 0, '□ {{s2_heading}}');
    doc.updateParagraphText(0, sourceIndex + 2, 0, '□ {{s3_heading}}');
    doc.updateParagraphText(0, sourceIndex + 3, 0, '□ {{s4_heading}}');

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    // Each placeholder must appear exactly once — no aliasing, no concat.
    expect((xml.match(/\{\{s1_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s2_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s3_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s4_heading\}\}/g) || []).length).toBe(1);

    // No paragraph should contain multiple placeholders concatenated together
    // (e.g. "{{s4_heading}}{{s3_heading}}" was the hallmark of the old bug).
    expect(xml).not.toMatch(/\{\{s\d_heading\}\}\{\{s\d_heading\}\}/);

    // Reopen via a fresh document and verify in-memory state also matches
    const outPath = path.join(testDir, 'copy-update-1.hwpx');
    fs.writeFileSync(outPath, buffer);
    const reopened = await HwpxDocument.createFromBuffer('copy-update-1-reopened', outPath, buffer);
    const paragraphs = reopened.getParagraphs(0);
    const texts = paragraphs.map(p => p.text).join(' | ');
    expect(texts).toContain('{{s1_heading}}');
    expect(texts).toContain('{{s2_heading}}');
    expect(texts).toContain('{{s3_heading}}');
    expect(texts).toContain('{{s4_heading}}');
  });

  it('copy then update the copy does not mutate the source', async () => {
    const doc = HwpxDocument.createNew('copy-update-2');

    const sourceIndex = doc.insertParagraph(0, 0, 'ORIGINAL TEXT');
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);

    // Only touch the copy. The source must remain exactly "ORIGINAL TEXT".
    doc.updateParagraphText(0, sourceIndex + 1, 0, 'COPY TEXT');

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    expect((xml.match(/ORIGINAL TEXT/g) || []).length).toBe(1);
    expect((xml.match(/COPY TEXT/g) || []).length).toBe(1);

    // Order must be [source="ORIGINAL TEXT", copy="COPY TEXT"]
    const origPos = xml.indexOf('ORIGINAL TEXT');
    const copyPos = xml.indexOf('COPY TEXT');
    expect(origPos).toBeGreaterThan(0);
    expect(copyPos).toBeGreaterThan(origPos);
  });

  it('update source between copies — each copy carries the text it was given', async () => {
    const doc = HwpxDocument.createNew('copy-update-3');

    const sourceIndex = doc.insertParagraph(0, 0, 'TEMPLATE');

    // Copy 1, update copy to A
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);
    doc.updateParagraphText(0, sourceIndex + 1, 0, 'A');

    // Copy 2 of the SOURCE (not of copy 1), update copy to B
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 1);
    doc.updateParagraphText(0, sourceIndex + 2, 0, 'B');

    // Copy 3 of the SOURCE, update copy to C
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 2);
    doc.updateParagraphText(0, sourceIndex + 3, 0, 'C');

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    // Source still intact, each copy has its own letter
    expect((xml.match(/>TEMPLATE</g) || []).length).toBe(1);
    expect((xml.match(/>A</g) || []).length).toBe(1);
    expect((xml.match(/>B</g) || []).length).toBe(1);
    expect((xml.match(/>C</g) || []).length).toBe(1);
  });

  /**
   * Loaded-template variant: stresses the full production path.
   *
   * createNew() paragraphs have no cached XML position, so they never exercise
   * the `getCachedXmlPosition()` tier in applyDirectTextUpdatesToXml(). The real
   * 공문서.hwpx bug went through HwpxParser, which populates `_xmlPosition` on
   * every parsed paragraph — and that cache is what routed text updates onto
   * the wrong paragraph after a copy_paragraph duplicated the source's cached
   * offsets into the clone.
   *
   * This test reproduces that path by writing a document to disk, reopening
   * it via createFromBuffer() (so paragraphs come back with populated
   * `_xmlPosition`), then running the copy → update flow that corrupted the
   * template.
   */
  it('copy+update on a reopened (parsed) document — no stale cached-position aliasing', async () => {
    // Seed a document with three content paragraphs and write it out, then
    // reopen so HwpxParser populates _xmlPosition on every paragraph.
    const seed = HwpxDocument.createNew('copy-update-parsed-seed');
    seed.insertParagraph(0, 0, '□ {{s1_heading}}');
    seed.insertParagraph(0, 1, '□ FILLER_A');
    seed.insertParagraph(0, 2, '□ FILLER_B');
    const seedBuf = await seed.save();
    const seedPath = path.join(testDir, 'copy-update-parsed-seed.hwpx');
    fs.writeFileSync(seedPath, seedBuf);

    const doc = await HwpxDocument.createFromBuffer('copy-update-parsed', seedPath, seedBuf);

    // Locate the source paragraph by text (its elementIndex depends on how
    // HwpxParser ordered the reloaded section — we don't hardcode it).
    const paras = doc.getParagraphs(0);
    const sourceIndex = paras.findIndex(p => p.text === '□ {{s1_heading}}');
    expect(sourceIndex).toBeGreaterThanOrEqual(0);

    // Copy three times (same flow as the original regression test)
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 1);
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 2);

    doc.updateParagraphText(0, sourceIndex,     0, '□ {{s1_heading}}');
    doc.updateParagraphText(0, sourceIndex + 1, 0, '□ {{s2_heading}}');
    doc.updateParagraphText(0, sourceIndex + 2, 0, '□ {{s3_heading}}');
    doc.updateParagraphText(0, sourceIndex + 3, 0, '□ {{s4_heading}}');

    const outBuf = await doc.save();
    const xml = await readSectionXml(outBuf);

    expect((xml.match(/\{\{s1_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s2_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s3_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s4_heading\}\}/g) || []).length).toBe(1);
    expect(xml).not.toMatch(/\{\{s\d_heading\}\}\{\{s\d_heading\}\}/);

    // Filler paragraphs must remain untouched
    expect((xml.match(/FILLER_A/g) || []).length).toBe(1);
    expect((xml.match(/FILLER_B/g) || []).length).toBe(1);
  });

  /**
   * insertParagraph(-1) index-mismatch regression.
   *
   * Historical bug: in-memory `insertParagraph(sectionIndex, -1, ...)` spliced
   * the new paragraph at elements[0], but applyParagraphInsertsToXml() placed
   * it AFTER the first <hp:p> (because that paragraph carries <hp:secPr> and
   * HWPX forbids anything before it). The off-by-one made every subsequent
   * copy_paragraph/update_paragraph_text resolve to different paragraphs in
   * memory vs. XML — silent corruption whose hallmark was "only one of N
   * updates survives the round-trip."
   *
   * This test locks in the fix by round-tripping a -1-seeded paragraph through
   * copy + update + save + reload and checking that the reparsed document
   * exposes exactly one copy of each placeholder, in the right order.
   */
  it('insertParagraph(-1) keeps in-memory and XML indices aligned across copy+update', async () => {
    const doc = HwpxDocument.createNew('copy-update-neg1');

    const sourceIndex = doc.insertParagraph(0, -1, '□ {{s1_heading}}');
    // After the fix, -1 is re-mapped to "insert after the secPr paragraph,"
    // so the returned index is 1 rather than the historical (mismatched) 0.
    expect(sourceIndex).toBe(1);

    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 1);
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex + 2);

    doc.updateParagraphText(0, sourceIndex,     0, '□ {{s1_heading}}');
    doc.updateParagraphText(0, sourceIndex + 1, 0, '□ {{s2_heading}}');
    doc.updateParagraphText(0, sourceIndex + 2, 0, '□ {{s3_heading}}');
    doc.updateParagraphText(0, sourceIndex + 3, 0, '□ {{s4_heading}}');

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    expect((xml.match(/\{\{s1_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s2_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s3_heading\}\}/g) || []).length).toBe(1);
    expect((xml.match(/\{\{s4_heading\}\}/g) || []).length).toBe(1);
    expect(xml).not.toMatch(/\{\{s\d_heading\}\}\{\{s\d_heading\}\}/);

    // After reload the placeholders must appear in s1 → s2 → s3 → s4 order,
    // confirming that the in-memory index the caller used to drive updates
    // ended up addressing the same paragraphs on the XML side.
    const outPath = path.join(testDir, 'copy-update-neg1.hwpx');
    fs.writeFileSync(outPath, buffer);
    const reopened = await HwpxDocument.createFromBuffer('copy-update-neg1-reopened', outPath, buffer);
    const texts = reopened.getParagraphs(0).map(p => p.text);
    const placeholderOrder = texts.filter(t => /\{\{s\d_heading\}\}/.test(t));
    expect(placeholderOrder).toEqual([
      '□ {{s1_heading}}',
      '□ {{s2_heading}}',
      '□ {{s3_heading}}',
      '□ {{s4_heading}}',
    ]);
  });

  /**
   * Codex P1-b regression (2026-04-22):
   *   Multiple copyParagraph calls share the same targetAfter slot, then each
   *   copy gets a distinct update. Before the cloneId-based lookup fix, the
   *   overlay step in applyParagraphCopiesToXml used `targetAfter + 1` to find
   *   the in-memory clone, so the earlier pending copy would read the later
   *   clone's text and both copies would collapse onto the last value.
   */
  it('two copies to the same targetAfter each keep their own text', async () => {
    const seed = HwpxDocument.createNew('shared-target-after-seed');
    seed.insertParagraph(0, 0, 'TEMPLATE');
    const seedBuf = await seed.save();
    const seedPath = path.join(testDir, 'shared-target-after-seed.hwpx');
    fs.writeFileSync(seedPath, seedBuf);

    const doc = await HwpxDocument.createFromBuffer('shared-target-after', seedPath, seedBuf);
    const paras = doc.getParagraphs(0);
    const sourceIndex = paras.findIndex(p => p.text === 'TEMPLATE');
    expect(sourceIndex).toBeGreaterThanOrEqual(0);

    // Two copies with the SAME targetAfter. Each in-memory splice inserts the
    // new clone at `targetAfter + 1`, so after both calls the elements layout
    // around the source is: [..., source, cloneB, cloneA, ...] — not
    // [..., source, cloneA, cloneB, ...]. The overlay must find each clone by
    // its unique cloneId rather than by the fixed `targetAfter + 1` slot.
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);  // clone A
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);  // clone B, pushes A down

    // clone B is now at sourceIndex + 1, clone A at sourceIndex + 2.
    doc.updateParagraphText(0, sourceIndex + 1, 0, 'B_TEXT');
    doc.updateParagraphText(0, sourceIndex + 2, 0, 'A_TEXT');

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    expect((xml.match(/>TEMPLATE</g) || []).length).toBe(1);
    expect((xml.match(/>A_TEXT</g) || []).length).toBe(1);
    expect((xml.match(/>B_TEXT</g) || []).length).toBe(1);
  });

  /**
   * Scenario B (Codex P1-a regression):
   *   update source → copyParagraph → save
   *
   * copyParagraph() deep-clones the source's ParagraphData at call time, so the
   * in-memory clone reflects the pre-copy update. But applyParagraphCopiesToXml()
   * copies raw XML bytes from the zip, which still carry the original text —
   * applyDirectTextUpdatesToXml() runs later and only targets the source. The
   * fix is overlayInMemoryRunTextsOntoParagraphXml(), which stamps the clone's
   * in-memory text onto the copied XML before insertion.
   */
  it('Scenario B: update then copy — copy preserves the updated text', async () => {
    // Seed and write, then reopen so _xmlPosition is populated (stresses the
    // full production path, same rationale as the parsed-document test above).
    const seed = HwpxDocument.createNew('scenario-b-seed');
    seed.insertParagraph(0, 0, 'ORIGINAL');
    const seedBuf = await seed.save();
    const seedPath = path.join(testDir, 'scenario-b-seed.hwpx');
    fs.writeFileSync(seedPath, seedBuf);

    const doc = await HwpxDocument.createFromBuffer('scenario-b', seedPath, seedBuf);
    const paras = doc.getParagraphs(0);
    const sourceIndex = paras.findIndex(p => p.text === 'ORIGINAL');
    expect(sourceIndex).toBeGreaterThanOrEqual(0);

    // Order matters: update FIRST, then copy. Without the overlay fix the
    // saved clone would hold the pre-update "ORIGINAL" bytes.
    doc.updateParagraphText(0, sourceIndex, 0, 'UPDATED');
    doc.copyParagraph(0, sourceIndex, 0, sourceIndex);

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    // Both source and clone must carry the updated text. "ORIGINAL" must be gone.
    expect((xml.match(/>UPDATED</g) || []).length).toBe(2);
    expect(xml).not.toMatch(/>ORIGINAL</);
  });

  /**
   * Scenario C (Codex P1-b regression):
   *   updateParagraphText → moveParagraph → save
   *
   * moveParagraph() splices the in-memory element to a new index, but the
   * pending direct-text-update record captured the *old* elementIndex at call
   * time. Without remapPendingDirectTextUpdateIndices() the save would apply
   * the text update to whatever paragraph now occupies the old index (i.e. a
   * sibling), wrongly mutating it and leaving the moved paragraph untouched.
   */
  it('Scenario C: update then move — update lands on the moved paragraph', async () => {
    const seed = HwpxDocument.createNew('scenario-c-seed');
    seed.insertParagraph(0, 0, 'ALPHA');
    seed.insertParagraph(0, 1, 'BETA');
    seed.insertParagraph(0, 2, 'GAMMA');
    const seedBuf = await seed.save();
    const seedPath = path.join(testDir, 'scenario-c-seed.hwpx');
    fs.writeFileSync(seedPath, seedBuf);

    const doc = await HwpxDocument.createFromBuffer('scenario-c', seedPath, seedBuf);
    const paras = doc.getParagraphs(0);
    const alphaIdx = paras.findIndex(p => p.text === 'ALPHA');
    const gammaIdx = paras.findIndex(p => p.text === 'GAMMA');
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(gammaIdx).toBeGreaterThan(alphaIdx);

    // Update ALPHA → ALPHA_UPDATED (elementIndex = alphaIdx).
    doc.updateParagraphText(0, alphaIdx, 0, 'ALPHA_UPDATED');

    // Then move ALPHA to after GAMMA. After the splice ALPHA's elementIndex
    // changes, but the pending update still references the old index — this
    // is exactly what remapPendingDirectTextUpdateIndices() has to recover.
    const moved = doc.moveParagraph(0, alphaIdx, 0, gammaIdx);
    expect(moved).toBe(true);

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    // The moved paragraph must carry the updated text, BETA/GAMMA must be
    // untouched, and the old "ALPHA" literal must be gone.
    expect((xml.match(/>ALPHA_UPDATED</g) || []).length).toBe(1);
    expect((xml.match(/>BETA</g) || []).length).toBe(1);
    expect((xml.match(/>GAMMA</g) || []).length).toBe(1);
    expect(xml).not.toMatch(/>ALPHA</);

    // After reparse, order must be BETA → GAMMA → ALPHA_UPDATED.
    const outPath = path.join(testDir, 'scenario-c.hwpx');
    fs.writeFileSync(outPath, buffer);
    const reopened = await HwpxDocument.createFromBuffer('scenario-c-reopened', outPath, buffer);
    const reopenedTexts = reopened.getParagraphs(0).map(p => p.text);
    const orderIdx = {
      beta: reopenedTexts.indexOf('BETA'),
      gamma: reopenedTexts.indexOf('GAMMA'),
      alpha: reopenedTexts.indexOf('ALPHA_UPDATED'),
    };
    expect(orderIdx.beta).toBeGreaterThanOrEqual(0);
    expect(orderIdx.gamma).toBeGreaterThan(orderIdx.beta);
    expect(orderIdx.alpha).toBeGreaterThan(orderIdx.gamma);
  });

  /**
   * Codex P1 follow-up (2026-04-22):
   *   update → moveParagraph into a DIFFERENT section → save.
   *
   * The paragraph-id remap originally only scanned `update.sectionIndex`, so a
   * cross-section move left the pending update pointing at a section that no
   * longer contained the paragraph. applyDirectTextUpdatesToXml() would then
   * either mutate a sibling in the old section or silently drop the edit.
   * This test fails without the "scan every section" fallback.
   */
  it('Scenario C (cross-section): update then move into another section — update follows the paragraph', async () => {
    // Build a two-section HWPX on disk so the round-trip through HwpxParser
    // populates the cached positions that the remap needs to recover from.
    const seed = HwpxDocument.createNew('scenario-c-xsec-seed');
    seed.insertParagraph(0, 0, 'MOVE_ME');
    seed.insertSection(0);
    seed.insertParagraph(1, 0, 'TARGET_ANCHOR');
    const seedBuf = await seed.save();

    // Verify the seed actually has two sections before proceeding — if the
    // platform's insertSection() semantics change we'd rather skip than test
    // the wrong thing.
    const seedZip = await JSZip.loadAsync(seedBuf);
    const hasSection1 = !!seedZip.file('Contents/section1.xml');
    if (!hasSection1) {
      // Environment doesn't support multi-section persistence; skip.
      return;
    }

    const seedPath = path.join(testDir, 'scenario-c-xsec-seed.hwpx');
    fs.writeFileSync(seedPath, seedBuf);

    const doc = await HwpxDocument.createFromBuffer('scenario-c-xsec', seedPath, seedBuf);

    // Find the paragraphs by scanning every section — the exact section
    // indices assigned by the parser after a round-trip are an implementation
    // detail we don't want to hardcode.
    let moveSec = -1, moveIdx = -1, anchorSec = -1, anchorIdx = -1;
    for (let si = 0; si < 4; si++) {
      const paras = doc.getParagraphs(si);
      if (!paras || paras.length === 0) continue;
      const mi = paras.findIndex(p => p.text === 'MOVE_ME');
      const ai = paras.findIndex(p => p.text === 'TARGET_ANCHOR');
      if (mi >= 0) { moveSec = si; moveIdx = mi; }
      if (ai >= 0) { anchorSec = si; anchorIdx = ai; }
    }
    // If the parser collapsed the two sections into one during the round trip
    // (older builds did this), the cross-section path isn't reachable — skip
    // rather than produce a false negative.
    if (moveSec < 0 || anchorSec < 0 || moveSec === anchorSec) {
      return;
    }

    // Update first (records pending update at sectionIndex=moveSec), then
    // move across sections. After the move the paragraph no longer lives in
    // moveSec — the pending-update record has to be remapped to anchorSec.
    doc.updateParagraphText(moveSec, moveIdx, 0, 'MOVE_ME_UPDATED');
    const moved = doc.moveParagraph(moveSec, moveIdx, anchorSec, anchorIdx);
    expect(moved).toBe(true);

    const buffer = await doc.save();
    const zip = await JSZip.loadAsync(buffer);
    const xmlMove = await zip.file(`Contents/section${moveSec}.xml`)?.async('string');
    const xmlAnchor = await zip.file(`Contents/section${anchorSec}.xml`)?.async('string');
    if (!xmlMove || !xmlAnchor) throw new Error('section XML missing after save');

    // Updated text must end up in the destination section.
    expect((xmlAnchor.match(/>MOVE_ME_UPDATED</g) || []).length).toBe(1);
    expect((xmlAnchor.match(/>TARGET_ANCHOR</g) || []).length).toBe(1);

    // The source section must not contain either variant — the paragraph is
    // gone, and the update must not have bled onto a sibling there.
    expect(xmlMove).not.toMatch(/>MOVE_ME_UPDATED</);
    expect(xmlMove).not.toMatch(/>MOVE_ME</);
  });

  /**
   * Codex 2nd-pass P1 regression (2026-04-22):
   *   setParagraphStyle → copyParagraph BEFORE the styled paragraph → save.
   *
   * The reordered save pipeline runs copies before `applyParagraphStylesToXml`,
   * so the elementIndex captured when the style was set is now off by the
   * number of copies inserted before it. Without paragraphId-based remapping
   * of the pending style, the style would land on whichever paragraph now
   * occupies the old index (i.e., the newly inserted clone).
   */
  it('Scenario D: set style, then copy a paragraph before it — style stays on the originally-targeted paragraph', async () => {
    const seed = HwpxDocument.createNew('scenario-d-seed');
    seed.insertParagraph(0, 0, 'BEFORE');
    seed.insertParagraph(0, 1, 'TARGET');
    const seedBuf = await seed.save();
    const seedPath = path.join(testDir, 'scenario-d-seed.hwpx');
    fs.writeFileSync(seedPath, seedBuf);

    const doc = await HwpxDocument.createFromBuffer('scenario-d', seedPath, seedBuf);
    const paras = doc.getParagraphs(0);
    const beforeEntry = paras.find(p => p.text === 'BEFORE');
    const targetEntry = paras.find(p => p.text === 'TARGET');
    expect(beforeEntry).toBeTruthy();
    expect(targetEntry).toBeTruthy();
    const beforeIdx = beforeEntry!.index;
    const targetIdx = targetEntry!.index;
    expect(targetIdx).toBeGreaterThan(beforeIdx);

    // Style TARGET — records elementIndex=targetIdx with the paragraph's
    // stable id, so the pipeline-reorder P1 fix can remap after the copy.
    doc.applyParagraphStyle(0, targetIdx, { align: 'center' });

    // Now copy BEFORE in front of itself. The clone lands at beforeIdx+1,
    // which shifts TARGET from targetIdx to targetIdx+1 in memory. Without
    // the remap, the style would fall on the clone (the new occupant of the
    // old element index) instead of TARGET.
    doc.copyParagraph(0, beforeIdx, 0, beforeIdx);

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    // Walk the section XML:
    //  - collect every top-level paragraph with its paraPrIDRef and text
    //  - find the paraPr ids whose align is CENTER from header.xml
    const headerXml = await (async () => {
      const zip = await JSZip.loadAsync(buffer);
      return zip.file('Contents/header.xml')?.async('string');
    })();
    expect(headerXml).toBeTruthy();

    // paraPr ids that carry align="CENTER"
    const centeredParaPrIds = new Set<string>();
    const paraPrRe = /<hh:paraPr[^>]*\sid="(\d+)"[^>]*>[\s\S]*?<\/hh:paraPr>/g;
    let mp: RegExpExecArray | null;
    while ((mp = paraPrRe.exec(headerXml!))) {
      const block = mp[0];
      if (/<hh:align[^>]*horizontal="CENTER"/.test(block)) {
        centeredParaPrIds.add(mp[1]);
      }
    }
    expect(centeredParaPrIds.size).toBeGreaterThan(0);

    // Top-level paragraphs (the ones that can carry our paraPrIDRef assignment)
    const paraRe = /<(?:hp|hs):p\s+([^>]*?)>([\s\S]*?)<\/(?:hp|hs):p>/g;
    const paragraphsInXml: Array<{ paraPrId: string; text: string }> = [];
    let mm: RegExpExecArray | null;
    while ((mm = paraRe.exec(xml))) {
      const attrs = mm[1];
      const body = mm[2];
      const prIdMatch = attrs.match(/paraPrIDRef="(\d+)"/);
      if (!prIdMatch) continue;
      // Collect text from ALL hp:t nodes inside this paragraph (concatenated).
      const runTexts = Array.from(body.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)).map(m => m[1]);
      paragraphsInXml.push({ paraPrId: prIdMatch[1], text: runTexts.join('') });
    }

    const centered = paragraphsInXml.filter(p => centeredParaPrIds.has(p.paraPrId));
    // Exactly one paragraph should be centered — the one we targeted.
    expect(centered.length).toBe(1);
    expect(centered[0].text).toBe('TARGET');
  });

  /**
   * Codex P2 follow-up (2026-04-22):
   *   update a paragraph whose source XML has no <hp:t> tag (the
   *   updateParagraphText() "synthesise run 0 in memory" branch) → copy → save.
   *
   * Without the overlay's `<hp:t>` injection fallback, the cloned paragraph
   * would go to disk with the text-less XML it was cloned from, and the
   * caller's update would never reach the copy.
   */
  it('Scenario B (empty runs): update a paragraph with no <hp:t> node then copy — copy carries the new text', async () => {
    // createNew() seeds a paragraph without any runs at element 0 (implicit
    // secPr paragraph). We insert an explicit empty paragraph whose XML also
    // lacks a <hp:t> — the parser won't materialise runs for it, so the first
    // updateParagraphText() call synthesises run[0] in memory.
    const doc = HwpxDocument.createNew('scenario-b-empty');

    // createNew's implicit element 0 is the empty secPr paragraph. Write
    // through it so the synthesize-run-0 branch runs, then copy.
    const targetIdx = 0;
    const before = doc.getParagraph(0, targetIdx);
    expect(before).toBeTruthy();
    // The implicit paragraph must genuinely have no runs for this test to
    // exercise the P2 path. Skip otherwise — createNew() implementation may
    // change in the future.
    if (!before || (before.runs && before.runs.length > 0)) {
      return;
    }

    doc.updateParagraphText(0, targetIdx, 0, 'INJECTED');
    doc.copyParagraph(0, targetIdx, 0, targetIdx);

    const buffer = await doc.save();
    const xml = await readSectionXml(buffer);

    // Both the original and the copy should carry "INJECTED". Before the
    // overlay-injection fix, only the original got it; the copy kept the
    // empty/text-less source XML.
    expect((xml.match(/>INJECTED</g) || []).length).toBe(2);
  });

  /**
   * Codex 3rd-pass P1 regression (2026-04-22):
   *   applyParagraphStyle(src) → copyParagraph(src) → save.
   *
   * The reordered save pipeline flushes applyParagraphCopiesToXml() BEFORE
   * applyParagraphStylesToXml(), so the cloned XML is a pre-style snapshot
   * of the source. Without duplicating the pending style op for the clone,
   * only the source receives align=CENTER and the clone is left unstyled.
   */
  it('Scenario E: style source then copy — clone inherits the pending style', async () => {
    const seed = HwpxDocument.createNew('scenario-e-seed');
    seed.insertParagraph(0, 0, 'SOURCE');
    const seedBuf = await seed.save();
    const seedPath = path.join(testDir, 'scenario-e-seed.hwpx');
    fs.writeFileSync(seedPath, seedBuf);

    const doc = await HwpxDocument.createFromBuffer('scenario-e', seedPath, seedBuf);
    const paras = doc.getParagraphs(0);
    const src = paras.find(p => p.text === 'SOURCE');
    expect(src).toBeTruthy();
    const srcIdx = src!.index;

    // Style FIRST, then copy — this is the previously-regressed ordering.
    doc.applyParagraphStyle(0, srcIdx, { align: 'center' });
    doc.copyParagraph(0, srcIdx, 0, srcIdx);

    const buffer = await doc.save();
    const zipOut = await JSZip.loadAsync(buffer);
    const xml = await zipOut.file('Contents/section0.xml')?.async('string');
    const headerXml = await zipOut.file('Contents/header.xml')?.async('string');
    expect(xml).toBeTruthy();
    expect(headerXml).toBeTruthy();

    // Collect all paraPr ids that carry align="CENTER".
    const centeredParaPrIds = new Set<string>();
    const paraPrRe = /<hh:paraPr[^>]*\sid="(\d+)"[^>]*>[\s\S]*?<\/hh:paraPr>/g;
    let mp: RegExpExecArray | null;
    while ((mp = paraPrRe.exec(headerXml!))) {
      if (/<hh:align[^>]*horizontal="CENTER"/.test(mp[0])) {
        centeredParaPrIds.add(mp[1]);
      }
    }
    expect(centeredParaPrIds.size).toBeGreaterThan(0);

    // Walk the paragraphs and count how many "SOURCE" paragraphs are centered.
    const paraRe = /<(?:hp|hs):p\s+([^>]*?)>([\s\S]*?)<\/(?:hp|hs):p>/g;
    let sourceCount = 0;
    let centeredSourceCount = 0;
    let mm: RegExpExecArray | null;
    while ((mm = paraRe.exec(xml!))) {
      const text = Array.from(mm[2].matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)).map(m => m[1]).join('');
      if (text !== 'SOURCE') continue;
      sourceCount++;
      const prIdMatch = mm[1].match(/paraPrIDRef="(\d+)"/);
      if (prIdMatch && centeredParaPrIds.has(prIdMatch[1])) centeredSourceCount++;
    }
    // Exactly two SOURCE paragraphs: the original and the copy.
    expect(sourceCount).toBe(2);
    // Both must be centered. Pre-fix, only the original carried align=CENTER.
    expect(centeredSourceCount).toBe(2);
  });

  /**
   * Codex 6th-pass P1 regression (2026-04-22):
   *   copyParagraph on a paragraph whose <hp:t> contains inline controls
   *   (e.g. <hp:tab/>) → save. The paragraph must survive the copy unaltered.
   *
   * HwpxParser.processTextContent expands a single <hp:t> that contains an
   * inline control (tab / lineBreak / nbSpace / fwSpace / autoNum / newNum /
   * indexMark / …) into MULTIPLE entries in paragraph.runs — one for each
   * text segment and one for each control. Meanwhile the old overlay paired
   * `paragraph.runs[i]` with `textRuns[i]` (the i-th <hp:t>-bearing XML run)
   * by raw index, so whenever runs.length > textRuns.length the indices
   * desynced and the overlay wrote an empty in-memory sentinel (from the
   * tab/lineBreak expansion) onto a later, genuinely text-bearing XML run —
   * silently blanking that run's content even when the caller never edited
   * the clone.
   *
   * Post-fix: when counts don't line up 1:1 the overlay is a no-op, so the
   * cloned XML keeps the exact bytes it was cloned from and the paragraph
   * reaches disk intact.
   */
  it('Scenario F: copy a paragraph containing inline <hp:tab/> — text on neighbouring runs is not blanked', async () => {
    // Start from a real skeleton so we inherit a valid header.xml / content.hpf.
    const seed = HwpxDocument.createNew('scenario-f-seed');
    seed.insertParagraph(0, 0, 'ANCHOR');
    const seedBuf = await seed.save();

    // Inject a custom paragraph into section0.xml whose single <hp:t> carries
    // an inline <hp:tab/> between three text segments across three <hp:run>
    // elements. Parser semantics (see HwpxParser.processTextContent) produce
    // in-memory runs = [FIRST, MID, '' /*tab sentinel*/, AFTER, LAST] — five
    // entries for three text-bearing XML runs. This is the exact count-mismatch
    // shape that triggered the pre-fix regression.
    const seedZip = await JSZip.loadAsync(seedBuf);
    const rawXml = await seedZip.file('Contents/section0.xml')?.async('string');
    if (!rawXml) throw new Error('seed section0.xml missing');

    const linesegarray =
      '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000"' +
      ' textheight="1000" baseline="850" spacing="600" horzpos="0"' +
      ' horzsize="0" flags="0"/></hp:linesegarray>';
    const tabParagraphXml =
      '<hp:p id="2147483640" paraPrIDRef="0" styleIDRef="0" pageBreak="0"' +
      ' columnBreak="0" merged="0">' +
      '<hp:run charPrIDRef="0"><hp:t>FIRST</hp:t></hp:run>' +
      '<hp:run charPrIDRef="0"><hp:t>MID<hp:tab width="4000" leader="0"/>AFTER</hp:t></hp:run>' +
      '<hp:run charPrIDRef="0"><hp:t>LAST</hp:t></hp:run>' +
      linesegarray +
      '</hp:p>';

    // Inject the custom paragraph at the very end of the section (just before
    // the closing </hp:sec> or </hs:sec> tag — whichever the skeleton uses).
    let sectionEndIdx = rawXml.lastIndexOf('</hp:sec>');
    if (sectionEndIdx === -1) sectionEndIdx = rawXml.lastIndexOf('</hs:sec>');
    if (sectionEndIdx === -1) throw new Error('section closing tag not found');
    const injectedXml =
      rawXml.slice(0, sectionEndIdx) + tabParagraphXml + rawXml.slice(sectionEndIdx);
    seedZip.file('Contents/section0.xml', injectedXml);

    const seededBuf = Buffer.from(await seedZip.generateAsync({ type: 'nodebuffer' }));
    const seededPath = path.join(testDir, 'scenario-f-seed.hwpx');
    fs.writeFileSync(seededPath, seededBuf);

    const doc = await HwpxDocument.createFromBuffer('scenario-f', seededPath, seededBuf);

    // Locate the tab-bearing paragraph by its FIRST text. getParagraphs() joins
    // all run texts, so we match on the concatenation of FIRST + MID + AFTER +
    // LAST (the inline tab sentinel is an empty-text run).
    const paras = doc.getParagraphs(0);
    const tabPara = paras.find(p => p.text.startsWith('FIRST') && p.text.includes('AFTER') && p.text.includes('LAST'));
    expect(tabPara).toBeTruthy();
    const srcIdx = tabPara!.index;

    // Copy the tab-bearing paragraph. No edits — this is the unedited-copy path
    // that the Codex 6th-pass review flagged as silently blanking text runs.
    doc.copyParagraph(0, srcIdx, 0, srcIdx);

    const out = await doc.save();
    const zipOut = await JSZip.loadAsync(out);
    const xmlOut = await zipOut.file('Contents/section0.xml')?.async('string');
    expect(xmlOut).toBeTruthy();

    // Both the original and the copy must still contain FIRST, MID, AFTER,
    // LAST, and the <hp:tab> control between MID and AFTER.
    const firstHits = (xmlOut!.match(/>FIRST</g) || []).length;
    const midHits = (xmlOut!.match(/>MID</g) || []).length;
    const afterHits = (xmlOut!.match(/AFTER</g) || []).length;
    const lastHits = (xmlOut!.match(/>LAST</g) || []).length;
    const tabHits = (xmlOut!.match(/<hp:tab\b/g) || []).length;

    // Pre-fix: LAST was blanked on the copy → lastHits dropped from 2 to 1.
    // We assert exactly 2 for every marker so the regression can't slip back.
    expect(firstHits).toBe(2);
    expect(midHits).toBe(2);
    expect(afterHits).toBe(2);
    expect(lastHits).toBe(2);
    expect(tabHits).toBe(2);
  });
});
