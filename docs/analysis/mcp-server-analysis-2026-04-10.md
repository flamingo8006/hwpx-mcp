# HWPX MCP 서버 현황 분석 보고서

- **분석일**: 2026-04-10
- **분석 도구**: Claude Opus 4.6 + OpenAI Codex (codex-cli 0.117.0)
- **Codex 전체 코드 품질 평가**: 4/10
- **대상**: `mcp-server/` 디렉토리 (Node.js/TypeScript MCP 서버)

---

## 1. 아키텍처 개요

### 1.1 프로젝트 구조

이 프로젝트는 두 개의 컴포넌트로 구성된다:

| 컴포넌트 | 경로 | 역할 |
|----------|------|------|
| VSCode Extension | `src/` | HWPX 문서 편집용 커스텀 에디터 (WebView 기반) |
| **Standalone MCP Server** | `mcp-server/` | AI 연동용 문서 조작 서버 (**주 개선 대상**) |

### 1.2 MCP 서버 주요 파일

| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `mcp-server/src/index.ts` | ~4,645 | MCP 도구 정의 (~127개), 요청 라우팅, 문서 잠금 |
| `mcp-server/src/HwpxDocument.ts` | ~13,094 | 핵심 문서 모델 — XML 조작, 저장, 편집, undo/redo |
| `mcp-server/src/HwpxParser.ts` | ~4,356 | HWPX ZIP/XML 파싱, 메타데이터/스타일 추출 |
| `mcp-server/src/HangingIndentCalculator.ts` | 중형 | 내어쓰기 너비 계산 로직 |
| `mcp-server/src/types.ts` | ~500+ | HWPML 기반 TypeScript 인터페이스 |
| `mcp-server/src/*.test.ts` | 28개 파일 | 테스트 스위트 (vitest) |

### 1.3 데이터 흐름

```
MCP 클라이언트 (Claude 등)
  ↓ MCP 프로토콜 (stdio)
index.ts — 도구 라우팅 + withDocumentLock()
  ↓
HwpxDocument.ts — 인메모리 문서 모델 조작
  ↓ open() / save()
HWPX 파일 (ZIP 아카이브)
  ├── Contents/section0.xml  ← 문단/테이블/이미지
  ├── Contents/header.xml    ← 스타일(charShape, paraShape)
  ├── Contents/content.hpf   ← 매니페스트
  ├── BinData/               ← 첨부 이미지
  └── version.xml
```

### 1.4 주요 설계 패턴

- **문서 라이프사이클**: `open_document` → 조작 → `save_document` → `close_document`
- **동시성**: `withDocumentLock()` — 문서별 promise-chain 직렬화 (부분 적용, 아래 참조)
- **지연 쓰기**: 변경사항을 `_pending*` 배열에 축적 후 `save()` 시 일괄 XML 반영
- **원자적 저장**: 임시파일 → ZIP 무결성 검증 → `fs.rename()` 원자적 이동
- **Undo/Redo**: `saveState()` 기반 50단계 스냅샷 스택

---

## 2. 도구 인벤토리 (~127개)

### 2.1 카테고리별 분류

| 카테고리 | 도구 수 | 주요 도구 |
|----------|---------|-----------|
| 문서 관리 | 4 | `open_document`, `close_document`, `save_document`, `list_open_documents` |
| 문서 정보 | 4 | `get_document_text`, `get_document_structure`, `get/set_document_metadata` |
| 문단 조작 | 11 | `get_paragraphs`, `insert_paragraph`, `delete_paragraph`, `update_paragraph_text`, `update_paragraph_text_preserve_styles`, `append_text_to_paragraph`, 스타일/내어쓰기 |
| 텍스트 스타일 | 8 | `set/get_text_style`, `set/get_paragraph_style`, 내어쓰기 CRUD, `set_auto_hanging_indent` |
| 검색/치환 | 4 | `search_text`, `replace_text`, `batch_replace`, `replace_text_in_cell` |
| 테이블 | 30+ | 셀 CRUD, 행/열 삽입/삭제, 병합/분할, 중첩 테이블, 셀 속성, 셀 내어쓰기 |
| 이미지 | 6 | `insert_image`, `insert_image_in_cell`, `render_mermaid`, `render_mermaid_in_cell`, 크기/삭제 |
| 도형 | 3 | `insert_line`, `insert_rect`, `insert_ellipse` |
| 머리글/바닥글 | 4 | `get/set_header`, `get/set_footer` |
| 각주/미주 | 4 | `get/insert_footnote`, `get/insert_endnote` |
| 북마크/링크 | 4 | `get/insert_bookmark`, `get/insert_hyperlink` |
| 수식 | 2 | `get_equations`, `insert_equation` |
| 메모 | 3 | `get_memos`, `insert_memo`, `delete_memo` |
| 섹션 | 5 | `get/insert/delete_section`, `get/set_section_xml` (Raw XML 직접 조작) |
| 스타일 정의 | 4 | `get_styles`, `get_char_shapes`, `get_para_shapes`, `apply_style` |
| 단 설정 | 2 | `get/set_column_def` |
| 내보내기 | 2 | `export_to_text`, `export_to_html` |
| Undo/Redo | 2 | `undo`, `redo` |
| XML 도구 | 5 | `analyze_xml`, `repair_xml`, `get_raw_section_xml`, `set_raw_section_xml`, `get_section_xml` |
| 고급 기능 | 10+ | 청킹, 검색, 위치 인덱싱, TOC, 읽기 캐시, 도구 가이드 |

### 2.2 완성도 평가

- 모든 도구에 `inputSchema` 정의 완비
- 도구 가이드 (`tool_guide`) 내장 — 워크플로우별 도구 추천
- TODO/미완성 표시 도구: 없음 (형식상 완성)

---

## 3. 코드 품질 상세 분석

### 3.1 강점

| 항목 | 상세 |
|------|------|
| **타입 안전성** | `any` 타입 거의 없음. HWPML 스펙 기반 포괄적 타입 (CharShape, ParaShape, BorderFill 등) |
| **테스트 스위트** | 28개 파일, 스트레스/레드팀/회귀 테스트 포함 |
| **원자적 저장** | 임시파일 → ZIP 검증 → `fs.rename()`. 저장 중 오류 시 원본 보호 |
| **Undo/Redo** | `saveState()` 기반 50단계 스냅샷 |
| **도구 가이드** | AI가 적절한 도구를 선택할 수 있도록 `tool_guide` 내장 |

### 3.2 치명적 약점

#### 3.2.1 동시성 보호 불완전 [Codex 발견]

`withDocumentLock()`이 일부 도구에만 적용되어 있다:

**잠금 적용된 도구:**
- `save_document`, `update_table_cell`

**잠금 없는 변경 도구 (race condition 위험):**

| 도구 | 위치 |
|------|------|
| `update_paragraph_text` | `index.ts:2565` |
| `set_text_style` | `index.ts:2614` |
| `set_paragraph_style` | `index.ts:2651` |
| `insert_table` | `index.ts:3540` |
| `insert_paragraph` | (핸들러 내) |
| `delete_paragraph` | (핸들러 내) |

→ 병렬 MCP 호출 시 인메모리 모델과 XML이 불일치할 수 있음.

#### 3.2.2 XML 조작이 전부 문자열/정규식 기반

XML 파서 라이브러리를 사용하지 않고, 모든 XML 읽기/쓰기가 문자열 조작과 정규식으로 이루어짐.

**위험 패턴 목록:**

| 위치 | 코드 패턴 | 위험 |
|------|-----------|------|
| `HwpxDocument.ts:5059` | `/<hp:(p\|tbl)\b[^>]*>[\s\S]*?<\/hp:\1>/g` | non-greedy `.*?`가 중첩 테이블에서 조기 매칭 종료 |
| `HwpxDocument.ts:5203` | `[...xml.matchAll(/<hp:p\s[^>]*>.*?<\/hp:p>/gs)]` | top-level 문단만 찾으려 하나 중첩 depth 구분 불가 |
| `HwpxDocument.ts:6940-7316` | `/<hp:t[^>]*>([^<]*)<\/hp:t>/g` 계단식 | CDATA, 수치 엔티티(`&#xHHHH;`) 미처리 |
| `HwpxDocument.ts:12146-12154` | `<hp:run charPrIDRef="...">` 매칭 | 속성 순서가 다르면 silent miss |
| `HwpxParser.ts:219-253` | `[^<]*`로 메타데이터 추출 | 중첩 마크업 존재 시 절삭 |
| `HwpxParser.ts:2437-2589` | `replace(/<[^>]+>/g, '')` 텍스트 정리 | 리터럴 `<`/`>` 포함 텍스트 파괴 |

#### 3.2.3 에러 핸들링 부족

- 13,094줄 중 `throw`/`catch`/`Error` 56건 (0.4%)
- 다수 메서드가 실패 시 `null`/빈 배열/`undefined` 반환 → **silent failure**
- XML 조작 전 유효성 사전 검사 없음
- `findTableById` (`HwpxDocument.ts:6520`): 테이블 미발견 시 `null` 반환, 로그 없음
- `extractTableFromMatch` (`HwpxDocument.ts:6539`): 닫는 태그 누락 시 `null` 반환, 로그 없음

#### 3.2.4 Character Shape 직렬화 불완전

`HwpxDocument.ts:4785-4787` 주석:
```
// The current serialization is incomplete and loses critical attributes
// (textColor, shadeColor, symMark, underline, strikeout, outline, shadow)
```
- 의도적으로 비활성화 (원본 `header.xml` 속성 보존 목적)
- 새 스타일 생성 시 이 속성들이 손실될 수 있음

---

## 4. 버그 및 잠재적 문제

### 4.1 확인된 문제

#### [BUG-1] 글자 범위 서식 기능 부재

**현황**: `set_text_style` (`index.ts:315-335`)은 `run_index` 단위 서식만 지원.

**문제**:
- 문단 내 특정 글자 범위(`start_pos`~`end_pos`)에만 서식 적용 불가
- `applyCharacterStyle()` (`HwpxDocument.ts:903-920`)은 전체 run 1개에만 스타일 적용
- run 분할(split) 로직이 없으므로 하나의 run 내 부분 서식 불가
- 데이터 모델(`TextRun` — `types.ts:622-636`)에도 범위 추상화 없음

**구현 시 주의**: JavaScript `substring()`은 UTF-16 코드 유닛 기반이라 한글 BMP 문자(U+AC00~U+D7AF)는 안전. 단, XML 바이트 오프셋(`types.ts:1553-1554`의 "Start/End byte offset")과 혼동하면 기존 서버의 바이트/글자 오프셋 버그 재현.

#### [BUG-2] 테이블 열 너비 균등 분할만 가능

**근본 원인** (`HwpxDocument.ts:3338-3339`):
```typescript
const defaultWidth = options?.width || 42520; // 42520 hwpunit ≈ 170mm
const cellWidth = options?.cellWidth || Math.floor(defaultWidth / cols);
```

**세부 문제:**
1. `insert_table` 도구 (`index.ts:1256-1270`)에 `col_widths` 파라미터 없음
2. `applyTableInsertsToXml()` (`HwpxDocument.ts:5172-5198`)에서 `<hp:colSz>` 요소 미생성
3. `HwpxTable.columnWidths` 필드가 `types.ts:917`에 존재하나 `insertTable()`에서 미사용
4. `HwpxParser.ts:2785-2792`는 `<hp:colSz>` 파싱을 지원하므로 파서 쪽은 준비됨
5. 중첩 테이블(`generateNestedTableXml()` — `HwpxDocument.ts:5690-5748`)도 동일 문제 (고정 `cellWidth = 8000`)

### 4.2 Codex 발견 추가 버그 후보

| # | 문제 | 위치 | 영향 |
|---|------|------|------|
| 1 | **사용자 정규식 미검증** — `replaceText()`에서 사용자 입력 regex 직접 `new RegExp()` 컴파일 | `HwpxDocument.ts:2894-2899` | 잘못된 패턴 → 예외 crash |
| 2 | **스타일 XML 속성 순서 의존** — `applyCharacterStylesToXml()`이 `<hp:run charPrIDRef="...">` 패턴만 매칭 | `HwpxDocument.ts:12146-12154` | 속성 순서 다르면 스타일 적용 silent miss |
| 3 | **파괴적 run 클리어** — `updateParagraphText()`가 run 0 갱신 시 나머지 전부 빈 문자열로 | `HwpxDocument.ts:689-715` | 의도적 설계이나, 단일 run 수정 의도 시 데이터 손실 |
| 4 | **테이블 셀 모델/XML 불일치** — `updateTableCell()`은 첫 번째 run만 갱신하지만, 저장 시 XML은 여러 문단으로 확장 | `HwpxDocument.ts:2644-2663` (모델) vs `7170-7316` (XML) | 다중 행 셀 내용 불일치 |
| 5 | **colSz 파싱 취약** — self-closing `<hp:colSz .../>` 형태 미처리 | `HwpxParser.ts:2785-2791` | self-closing 형태 문서의 열 너비 누락 |
| 6 | **Grapheme 분할 위험** — `updateParagraphTextPreserveStyles()`가 JS 코드 유닛 길이로 텍스트 분배 | `HwpxDocument.ts:748-793` | 이모지/합성 시퀀스에서 grapheme 중간 분할 가능 |

---

## 5. 테스트 커버리지 분석

### 5.1 테스트 파일 목록 (28개)

| 파일 | 크기 | 범위 |
|------|------|------|
| `HwpxDocument.test.ts` | 30KB | 핵심 문서 조작 |
| `HwpxDocument.e2e.test.ts` | 16KB | E2E 워크플로우 |
| `ComplexWorkflow.e2e.test.ts` | 38KB | 복합 시나리오 |
| `ConsolidatedTools.test.ts` | 15KB | 도구 통합 테스트 |
| `ParagraphTextUpdate.test.ts` | 5.4KB | 문단 텍스트 갱신 |
| `TextChunking.test.ts` | 9.6KB | 대용량 텍스트 |
| `HangingIndent.test.ts` | 11KB | 내어쓰기 |
| `AutoHangingIndent.test.ts` | 13KB | 자동 내어쓰기 |
| `HangingIndentCalculator.test.ts` | 27KB | 내어쓰기 계산 |
| `HangingIndentMultiPara.test.ts` | 7.1KB | 다중 문단 내어쓰기 |
| `CellMerge.test.ts` | 28KB | 셀 병합/분할 |
| `TableCellHangingIndent.test.ts` | 15KB | 셀 내 내어쓰기 |
| `MultiTableHangingIndent.test.ts` | 8.3KB | 다중 테이블 내어쓰기 |
| `ParallelTableUpdate.test.ts` | 12KB | 병렬 테이블 갱신 |
| `TableInsertRedTeam.test.ts` | 22KB | 테이블 삽입 스트레스 |
| `MoveTableImage.test.ts` | 14KB | 테이블-이미지 이동 |
| `CellImage.test.ts` | 6.9KB | 셀 내 이미지 |
| `RedTeam.extreme.test.ts` | 18KB | 극한 엣지 케이스 |
| `RedTeam.stress.test.ts` | 21KB | 스트레스/부하 |
| `XmlCorruptionPrevention.test.ts` | 21KB | XML 무결성 |
| `XmlValidation.e2e.test.ts` | 8.1KB | XML 유효성 |
| `TextDuplication.bug.test.ts` | 9.1KB | 텍스트 중복 회귀 |
| `TextDuplicationComplex.bug.test.ts` | 12KB | 복합 중복 회귀 |
| `RunStructure.bug.test.ts` | 13KB | Run 구조 회귀 |
| `RepairXml.test.ts` | 11KB | XML 수리 |
| `AgenticReading.test.ts` | 10KB | 문서 읽기 최적화 |
| `debug-save.test.ts` | 8.6KB | 저장 디버깅 |
| `update-text-persist.test.ts` | 2.4KB | 텍스트 저장 영속성 |

### 5.2 커버리지 공백

| 미테스트 영역 | 위험도 | 비고 |
|---------------|--------|------|
| `set_text_style` / `applyCharacterStyle` | 높음 | run-level 폰트 스타일 직접 테스트 없음 |
| `insert_table` 열 너비 | 높음 | `<hp:colSz>`, `columnWidths`, 비균등 너비 미검증 |
| MCP 동시성 (핸들러 레벨) | 높음 | 메서드 레벨만 테스트, 실제 MCP 요청 인터리빙 미검증 |
| XML CDATA/수치 엔티티 | 중간 | 기본 태그 불균형만 테스트 |
| 스타일/북마크/수식/각주 | 중간 | 관련 테스트 파일 없음 |
| `HwpxParser.ts` | 중간 | 직접 테스트 없음 (Document를 통한 간접만) |
| Grapheme 경계 (이모지 등) | 낮음 | run 재분배 시 grapheme 분할 미테스트 |

---

## 6. 누락 기능 목록

| 기능 | 현황 | 비고 |
|------|------|------|
| **글자 범위 서식** | `set_text_style`은 run 단위만 | run 분할 + `start_pos`/`end_pos` 필요 |
| **열 너비 개별 지정** | `insert_table`에 `col_widths` 없음 | `<hp:colSz>` XML 생성 필요 |
| **테이블 후 열 너비 조정** | 별도 도구 없음 | `set_column_widths` 도구 필요 |
| **테이블 셀 테두리 스타일** | `set_cell_properties`에 부분적 | borderFill 관련 미지원 |
| **문단 번호/글머리 기호** | 도구 없음 | numbering/bullet 스타일 적용 필요 |
| **페이지 나눔 삽입** | 도구 없음 | `<hp:p>` 속성 `pageBreak` 활용 |

---

## 7. 개선 우선순위

### P1 — 데이터 무결성/안정성 (즉시)

| 항목 | 상세 | 관련 코드 |
|------|------|-----------|
| 동시성 잠금 통합 | 모든 변경 MCP 도구에 `withDocumentLock()` 적용 | `index.ts:20-54` (기존 잠금), 각 핸들러 |
| `insert_table` 열 너비 | `col_widths` 파라미터 + `<hp:colSz>` XML 생성 + `columnWidths` 연동 | `HwpxDocument.ts:3330-3395`, `5172-5198` |
| XML 조작 안전성 | 핫패스의 regex를 구조적 XML 커서/균형 노드 뮤테이터로 교체 | `HwpxDocument.ts:5059`, `5203`, `6940-7316` |

### P2 — 기능 완성도 (단기)

| 항목 | 상세 | 관련 코드 |
|------|------|-----------|
| 글자 범위 서식 | run 분할 기반 `format_text` 도구 추가 | `HwpxDocument.ts:903-920`, `types.ts:622-636` |
| 테이블 셀 모델/XML 통일 | 다중 행 셀 처리 로직 정리 | `HwpxDocument.ts:2644-2663`, `7170-7316` |
| 사용자 regex 검증 | `try/catch`로 regex 컴파일 오류 처리 | `HwpxDocument.ts:2894-2899` |
| 에러 핸들링 강화 | silent failure → 명시적 에러/로그 | 전반 |

### P3 — 구조 개선 (중기)

| 항목 | 상세 |
|------|------|
| `HwpxDocument.ts` 모듈 분리 | 12개 모듈로 분리 (아래 참조) |
| 테스트 확대 | 스타일, 열 너비, CDATA, MCP 동시성 테스트 추가 |
| Character Shape 직렬화 완성 | `textColor`, `shadeColor` 등 속성 보존 |

### Codex 제안 모듈 분리안

| 모듈 | 책임 |
|------|------|
| `HwpxDocument.ts` | Thin facade, undo/redo, 메타데이터, public 오케스트레이션 |
| `document/ParagraphEditor.ts` | 문단 CRUD, 텍스트 업데이트 |
| `document/TableEditor.ts` | 셀/행/열 CRUD, 병합/분할, 중첩 테이블 |
| `document/StyleEditor.ts` | 문단/글자 스타일, 내어쓰기 |
| `document/ReadingIndex.ts` | 청킹, 검색, TOC, 위치 인덱스 |
| `persistence/SavePipeline.ts` | `save()` 및 pending-op 실행 |
| `persistence/SectionXmlMutator.ts` | 섹션 XML 재작성 (문단/테이블/이미지/머리글) |
| `persistence/HeaderXmlMutator.ts` | paraPr/charPr/메타데이터/헤더 조작 |
| `xml/XmlLocator.ts` | 균형 태그 스캔, top-level 요소 탐색 |
| `xml/XmlRepair.ts` | 분석/수리/유효성 검사 |
| `xml/XmlEscaping.ts` | 엔티티 인코딩/디코딩, grapheme-safe 텍스트 |
| `types/operations.ts` | `_pending*` 작업 페이로드 타입 |

---

## 8. 기존 해결 이력

### solvelist.md 주요 항목

| 날짜 | 문제 | 해결 |
|------|------|------|
| 2026-01-23 | `updateParagraphText` 텍스트 중복 | run 0 갱신 시 나머지 run 클리어 로직 추가 |
| 2026-01-23 | XML 유효성 검사 미작동 | 부분 개선 (태그 균형 검사 추가) |
| 2026-01-25 | `replaceMultipleRunsInElement`에서 `<hp:t>` 태그 누락/중복 | 3가지 하위 버그 수정 |
| 2026-01-25 | pnpm symlink Windows 호환성 | npm 사용으로 해결 |

### PARAGRAPH_INDEXING_FIX.md

- **문제**: 테이블 포함 문서에서 문단 인덱스 오계산
- **원인**: element index와 paragraph index 혼동
- **해결**: `HwpxDocument.ts:7240-7276` 루프 조건 수정 (`<=` → `<`) + 직접 인덱스 사용

---

## 부록: 참조 코드 위치 요약

| 항목 | 파일:줄 |
|------|---------|
| MCP 도구 정의 시작 | `index.ts:22` |
| `withDocumentLock()` | `index.ts:28-54` |
| `set_text_style` 정의 | `index.ts:315-335` |
| `insert_table` 정의 | `index.ts:1256-1270` |
| `set_text_style` 핸들러 | `index.ts:2614-2636` |
| `insert_table` 핸들러 | `index.ts:3540-3554` |
| `applyCharacterStyle()` | `HwpxDocument.ts:903-920` |
| `updateParagraphText()` | `HwpxDocument.ts:689-715` |
| `insertTable()` | `HwpxDocument.ts:3330-3395` |
| `applyTableInsertsToXml()` 테이블 XML | `HwpxDocument.ts:5172-5198` |
| element regex (위험) | `HwpxDocument.ts:5059` |
| 셀 텍스트 교체 계단식 | `HwpxDocument.ts:6940-7316` |
| `applyCharacterStylesToXml()` | `HwpxDocument.ts:12146-12154` |
| 메타데이터 파싱 | `HwpxParser.ts:219-253` |
| colSz 파싱 | `HwpxParser.ts:2785-2792` |
| `TextRun` 인터페이스 | `types.ts:622-636` |
| `HwpxTable.columnWidths` | `types.ts:917` |
