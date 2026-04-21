---
name: hwpx-document-writer
description: DGIST 정보전산팀 공문서 형식으로 HWPX 한글 문서를 작성하는 스킬. 사용자가 "한글 문서 작성", "hwpx 파일 만들어줘", "보고서 한글로 저장", "hwpx로 작성", "한글 파일 생성", "공문서 작성", "보고서 작성해서 저장", "한글 문서 저장", "○○ 서식으로 작성", "○○ 양식으로 작성", "○○ 템플릿으로 작성" 등의 요청을 하면 이 스킬을 사용한다. hwpx-mcp 도구를 사용하여 한글(HWPX) 문서를 작성하는 작업이면 무조건 이 스킬을 먼저 참고할 것.
---

# HWPX 한글 문서 작성 스킬 (DGIST 공문서 서식 기준)

## 작성 모드 결정 (가장 먼저)

사용자 요청에 **서식/양식/템플릿** 관련 키워드가 있는지부터 확인.

| 사용자 발화 예시 | 모드 | 동작 |
|-----------------|------|------|
| "**공문서 서식으로** 보고서 작성" / "**공문 양식으로**" / "**템플릿으로** 작성" | **(A) 템플릿 모드** | 아래 "템플릿 모드 워크플로" 참조 |
| "한글 문서로 저장" / "hwpx 파일 만들어줘" / "보고서 작성" (서식 언급 없음) | **(B) 자유 작성 모드** | 아래 "자유 작성 모드 (build_document 3단계)" 참조 |

> 규칙:
> - "**서식**", "**양식**", "**템플릿**", "**형식**", 또는 아래 템플릿 카탈로그의 **트리거 키워드** 중 하나라도 요청에 포함 → **(A) 템플릿 모드**.
> - 그 외 → **(B) 자유 작성 모드**.
> - 모호한 경우 (A) 를 우선 시도하고, 매칭되는 템플릿이 없으면 (B) 로 폴백.

---

## 사용 가능한 템플릿 (`skills/templates/`)

| 파일명 | 트리거 키워드 (in 사용자 요청) | 설명 |
|--------|-------------------------------|------|
| `공문서.hwpx` | "공문서", "공문", "DGIST 공문", "공문 서식", "보고서 서식", "기본 서식", "표준 서식" | DGIST 정보전산팀 표준 공문서 (제목 장식 테이블 + 개요 박스 + □/ㅇ/-/ㆍ/* 계층 + 데이터 테이블 + 작성지침) |

**템플릿 경로 확보** — 절대경로는 환경마다 다르므로 **Glob 으로 동적 해결**:

```
Glob(pattern: "**/skills/templates/공문서.hwpx")
→ 결과의 첫 번째 경로를 사용
```

> 새 템플릿 추가 시: `skills/templates/` 에 `.hwpx` 파일을 넣고 이 표에 한 줄 추가.

---

## 자유 작성 모드 vs 템플릿 모드 — 핵심 차이

| | 자유 작성 모드 (B) | 템플릿 모드 (A) |
|--|-------------------|----------------|
| 시작점 | `create_document` 빈 문서 | 템플릿 복사본 열기 |
| 본문 생성 | `build_document` 1회 일괄 | placeholder `update_paragraph_text` / `update_table_cell` 반복 |
| 스타일 정확도 | build_document 범위 내 근사 | **템플릿 서식 100% 보존** |
| 호출 수 | 6회 (+ 선택적 후처리) | placeholder 개수 + 3회 (open/save/close) |
| 권장 상황 | 자유 양식, 빠른 초안 | 공식 문서, 서식 정확도 필수 |

---

## 핵심 원칙 (자유 작성 모드)

**`build_document` 도구를 사용하여 한 번의 호출로 전체 문서를 작성한다.**
개별 `insert_paragraph` / `set_text_style` 호출 반복 금지 (토큰 낭비).

**기준 서식**: `skills/templates/공문서.hwpx` 를 실측 분석한 결과를 반영.

---

## build_document 단독 호출의 한계와 후처리 전략

`build_document` 는 **골격 일괄 생성**용. 아래 항목은 단독 호출로는 지정 안 되지만 **후처리 도구로 완전 지원**되므로, 먼저 build_document 로 본문을 만든 뒤 후처리를 순차 적용한다.

| 항목 | build_document 단독 | 후처리 도구 (호출 순서 ②~③) |
|---|---|---|
| 폰트명 (HY헤드라인M 등) | ❌ 필드 없음 | `set_text_style` (`font_name`) — 셀 내부도 `table_index`/`row`/`col` 지정 |
| 내어쓰기 / firstLineIndent | ❌ 필드 없음 | `set_hanging_indent` (단락) / `set_table_cell_hanging_indent` (셀) |
| 셀별 배경색 | 헤더 행만 일괄 | `set_cell_background_color` |
| 셀별 폰트/크기/색 | 헤더 행만 일괄 | `set_text_style` (`table_index`/`row`/`col`) |
| 셀 병합 | ❌ | `merge_cells` / `split_cell` |
| 셀 세로정렬 등 속성 | ❌ | `set_cell_properties` |
| 표 셀 줄간격 | ❌ | 셀 paragraph에 `set_paragraph_style` |
| 문자 범위 부분 서식 | ❌ (단락 단위만) | `format_text` (start_pos/end_pos) |
| **inline font_size / bold / font_color** | ⚠️ **신뢰 불가** (아래 주의) | `set_text_style` 로 단락별 재적용 |

> **폰트명 주의**: `format_text` 는 "must exist in document font list" 조건이 있음. `create_document` 직후 font list 에 HY헤드라인M/휴먼명조/한양중고딕이 없으면 `set_text_style` 쪽이 더 안전.

> ⚠️ **`build_document` inline 스타일 버그 (2026-04-21 확인, hwpx-mcp-server@0.4.6)**:
> `build_document` element 에 `font_size`, `bold`, `font_color` 를 inline 으로 주면 다음 두 가지 문제가 발생한다:
> 1. **스타일이 다음 단락으로 밀리는 off-by-one** — 의도한 단락의 바로 뒤 단락에 붙거나 아예 누락됨.
> 2. **인덱스 재배치** — `build_document` 직후 `get_paragraphs` 결과의 인덱스와, **저장·재로드** 후 인덱스가 1칸씩 달라질 수 있음 (표 주변 빈 paragraph 처리 차이).
>
> **권장 패턴**:
> 1. `build_document` 는 **텍스트 + `align` + `margin_*` + `line_spacing` 정도만** 담아서 골격만 만든다.
> 2. `save_document` → `open_document` 로 **재로드** 한 뒤 `get_paragraphs` 로 확정된 인덱스를 다시 읽는다.
> 3. 그 인덱스 기준으로 `set_text_style` (font_size/bold/font_color), `set_hanging_indent` 를 각 단락에 재적용한다.
>
> 이 순서를 지키지 않으면 "□ 제목이 본문과 같은 크기로 보인다" 같은 증상이 나타난다.

> **내어쓰기 주의**: DGIST 공문서 양식에서 `□ / ㅇ / - / ㆍ / *` 기호는 단순 공백이 아니라 **음수 firstLineIndent (내어쓰기)** 로 정렬됨 (샘플 실측: 대분류 -27.3 pt, 중분류 -37.44 pt, 소분류 -36.6 pt, 세부 -44.92 pt, 각주 -56.64 pt). `build_document` 만으로는 이 값을 지정할 수 없으므로 **기호 + 앞쪽 공백으로 시각적 정렬** 을 하고, 정확한 내어쓰기가 필요하면 본문 생성 후 `set_hanging_indent` 를 각 단락에 적용.

> **완전 일치가 필요하면**: `skills/templates/` 의 템플릿을 열어 내용만 치환하는 방식(`update_paragraph_text_preserve_styles` / `update_table_cell`)이 더 빠름 — 아래 "템플릿 모드 워크플로" 섹션 참조.

---

## 자유 작성 모드 (build_document 3단계)

### Step 1. 문서 생성 + 제목 설정

```
create_document({ title: "문서 제목", creator: "작성자" })
→ returns { doc_id: "abc123" }
```

제목은 첫 단락(index 0)에 배치. 실제 서식 샘플은 제목을 3행 1열 장식 테이블 안에 넣지만, 단순화를 위해 **굵은 대형 paragraph** 로 작성 (장식 테이블이 반드시 필요하면 서식 샘플을 템플릿으로 여는 방식 사용):

```
update_paragraph_text({ doc_id, section_index: 0, paragraph_index: 0, text: "문서 제목" })
set_paragraph_style({ doc_id, section_index: 0, paragraph_index: 0, align: "center" })
set_text_style({ doc_id, section_index: 0, paragraph_index: 0, bold: true, font_size: 20, font_color: "0E1C2C" })
```

> 위 3개는 병렬 실행 가능.

### Step 2. build_document 로 본문 일괄 작성

`after_index: 0` 으로 제목 다음부터 전체 본문 삽입:

```json
build_document({
  doc_id: "...",
  after_index: 0,
  elements: [
    // 날짜 (오른쪽 정렬, 휴먼명조 12pt 권장)
    { type: "paragraph", text: "< '26. 4. 21 / 정보전산팀 >",
      align: "right", font_size: 12, line_spacing: 165, margin_bottom: 8 },

    // 개요 박스 (1×1 표, 실제 서식은 한양중고딕 13pt)
    { type: "table", rows: 1, cols: 1,
      data: [["개요 내용 · 문서 취지를 이 박스에 요약. 본문에 취지가 포함되면 생략 가능."]] },

    // 대분류 — □ 기호, 15pt
    { type: "paragraph", text: "□ 대분류 제목",
      font_size: 15, line_spacing: 165, margin_top: 10 },

    // 중분류 — ㅇ 기호, 14pt, 1칸 띄우기
    { type: "paragraph", text: " ㅇ 중분류 내용 (한 칸 띄우고 ㅇ)",
      font_size: 14, line_spacing: 160, margin_top: 5 },

    // 소분류 — - 기호, 14pt, 2칸 띄우기
    { type: "paragraph", text: "  - 소분류 세부 내용 (두 칸 띄우고 -)",
      font_size: 14, line_spacing: 160, margin_top: 5 },

    // 세부항목 — ㆍ 기호, 13pt, 3칸 띄우기
    { type: "paragraph", text: "   ㆍ 세부 항목 (세 칸 띄우고 ㆍ)",
      font_size: 13, line_spacing: 160, margin_top: 5 },

    // 각주/주석 — * 기호, 13pt, 5칸 띄우기 (중고딕 계열, 문단위 0pt)
    { type: "paragraph", text: "     * 각주/보충 설명",
      font_size: 13, line_spacing: 160 },

    // 표 (헤더 회색 #E5E5E5 + 검정 글자 + 가운데 정렬)
    { type: "paragraph", text: "<표 제목>",
      align: "left", font_size: 13, margin_top: 10, margin_bottom: 3 },
    { type: "table", rows: 4, cols: 3,
      header_bg_color: "E5E5E5", header_font_color: "000000",
      header_align: "center",
      col_widths: [8000, 16000, 18520],
      data: [
        ["구분", "항목A", "항목B"],
        ["행1", "내용1", "내용2"],
        ["행2", "내용3", "내용4"],
        ["행3", "내용5", "내용6"]
      ] },

    // 표 주석 — 왼쪽 정렬, 작게
    { type: "paragraph", text: "주: 출처 또는 부연 설명",
      align: "left", font_size: 10, margin_top: 3 }
  ]
})
```

### Step 3. 저장 (필수)

**반드시 `save_document` 를 호출해야 파일이 디스크에 기록된다.** build_document 만으로는 메모리 상태만 변경.

```
save_document({ doc_id, output_path: "/path/to/output.hwpx",
                create_backup: true, verify_integrity: true })
```

**저장 경로/파일명 기본 규칙 (사용자 미지정 시)**:

- **경로**: `~/Downloads/` (macOS/Linux) 또는 `%USERPROFILE%\Downloads\` (Windows)
- **파일명**: 문서 제목에서 자동 생성
  - 공백 → 언더스코어(`_`)
  - 특수문자 제거 (`/ \ : * ? " < > |`)
  - 확장자: `.hwpx`
  - 예: `iM_유니즈_업무협약서_검토_보고.hwpx`
  - 날짜 필요 시: `회의록_2026-04-21.hwpx`

> **중요**: 경로/파일명 미지정이어도 **절대 되묻지 말고** 위 규칙대로 저장한 후 저장 완료 메시지에 최종 경로를 포함.

**총 MCP 호출**: 6회 (create + 제목 3병렬 + build_document + save)

> **선택적 후처리(+N회)**: 정확한 내어쓰기가 필요하면 `set_hanging_indent` 를 단락별로 적용. 특정 폰트명(HY헤드라인M 등) 필요하면 `set_text_style` 로 단락·셀에 지정. 이 경우 호출은 늘어도 토큰은 insert_paragraph 반복 대비 여전히 경제적.

---

## 서식 규칙 (DGIST 공문서 실측 기준)

### 계층별 기호·폰트·간격 (샘플 실측)

| 레벨 | 기호 | 앞 공백 | font_size | 추천 font_name | firstLineIndent (pt) | line_spacing | margin_top |
|------|------|---------|-----------|----------------|----------------------|--------------|-----------|
| 제목 | (장식) | — | **20pt** | HY헤드라인M | — | 119~165 | — |
| 날짜 | `< … >` | — | 12~13pt | HY헤드라인M | — | 165 | 0 |
| 대분류 | `□` | 0칸 | **15pt** | HY헤드라인M | -27.3 | 165 | 0 |
| 중분류 | ` ㅇ` | 1칸 | 14pt | 휴먼명조 | -37.44 | 160 | 5 |
| 소분류 | `  -` | 2칸 | 14pt | 휴먼명조 | -36.6 | 160 | 5 |
| 세부 | `   ㆍ` | 3칸 | 13pt | 한양중고딕 | -44.92 | 160 | 5 |
| 각주 | `     *` | 5칸 | 13pt | 한양중고딕 | -56.64 | 160 | 0 |
| 표 제목 | `<…>` | — | 13pt | 휴먼명조 | — | 160 | 0 |
| 표 본문 | — | — | 12pt | 한양중고딕 | — | 130 | — |
| 표 헤더 | — | — | 12~13pt bold | 한양중고딕 | — | 130 | — |
| 표 주석 | `주:` | — | 10pt | 한양중고딕 | — | 160 | 3 |
| 표준 작성지침 | `▷` | — | 11~12pt | 함초롬돋움 | -19.48 | 145 | 0 |

> **색상**: 큰 제목은 `font_color: "0E1C2C"` (거의 검정) 또는 `"2E74B5"` (파란계) 모두 샘플에서 확인됨. 기본은 **#000000**, 장식 제목만 선택적으로 파란계 사용.

> **bold 사용**: 대분류 `□` 는 기본 미적용이 샘플 표준. 강조 시 `bold: true` 를 선택적으로 추가. 표 헤더 셀은 bold 권장.

> **firstLineIndent 는 build_document 로 불가** — 위 수치를 정확히 반영하려면 `set_hanging_indent` 를 각 단락 index 에 적용.

### 줄 간격 (`line_spacing`)

- **본문**: 160 (1.6배) — 대/중/소/세부/각주 모두
- **제목·머리말**: 165
- **표 내부 셀**: 130 (build_document 로는 직접 제어 불가, 생성 후 표 셀 재스타일 필요 시 `set_text_style` 로 개별 조정)
- **표준 작성지침 블록**: 145

### 표 스타일 (실제 서식 기준)

| 속성 | 헤더 행 | 데이터 행 |
|------|---------|----------|
| 배경색 | `header_bg_color: "E5E5E5"` (회색) | 없음 (흰색) |
| 글자색 | `header_font_color: "000000"` (검정) | 검정 (기본) |
| 정렬 | `header_align: "center"` | 기본 (left) |
| bold | 자동 | 일반 |
| 폰트 크기 | 12pt (표 내용과 동일) | 12pt |
| 테두리 | 0.12mm | 0.12mm |

> **과거 가이드의 `#2B579A` + `#FFFFFF` (진파랑 + 흰 글자) 헤더는 DGIST 서식 아님**. `#E5E5E5` + `#000000` 이 표준.

### 열 너비 (`col_widths`)

전체 너비 = **42520 hwpunit**. 실제 서식 샘플의 3열 표 기준 비율(119:255:108 ≈ 1:2.14:0.9):

| 열 수 | 추천 col_widths | 비고 |
|-------|----------------|------|
| 2열 | `[10000, 32520]` | 구분+내용 |
| 3열 (서식 샘플 비율) | `[8000, 24520, 10000]` | 구분-설명-값 |
| 3열 (균등) | `[14000, 14000, 14520]` | |
| 3열 (1:2:3) | `[7000, 14000, 21520]` | |
| 4열 | `[10000, 10000, 10000, 12520]` | |

### 편집용지 (서식 샘플 "< 표준 작성지침 >" 기준)

- 좌·우 여백: 20mm (≈ 56.69 pt)
- 위·아래 여백: 15mm (≈ 42.5 pt)
- 머리말·꼬리말: 10mm (≈ 28.35 pt)
- 용지: A4 세로 (595.28 × 841.88 pt)
- 문단 정렬: 양쪽정렬 (Justify)
- 기본 줄간격: 160%

> `create_document` 기본값이 위 설정과 유사. 엄격한 일치가 필요하면 `set_page_settings` 로 명시적 지정.
>
> 실제 `skills/templates/공문서.hwpx` 파일 자체는 marginTop/Bottom 이 19.84 pt (≈ 7mm) 로 저장돼 있으나, 문서 내부 표준 작성지침 텍스트(paragraph 26)가 15mm 를 명시하므로 **신규 생성 시 15mm 를 표준**으로 삼는다.

---

## 문서 유형별 패턴

### 보고서 (계획/결과 보고)

```
제목 → 날짜 → 개요박스 (1×1 표)
→ □ 추진 배경
   ㅇ 현황 (ㆍ 세부 항목)
   ㅇ 필요성
→ □ 추진 계획
   ㅇ 단계별 진행 (표, 헤더 회색)
   ㅇ 일정
→ □ 기대 효과
   ㅇ 효과1
   ㅇ 효과2
→ * 각주
```

### 안내문/가이드

```
제목 → 날짜 → 개요박스
→ □ 개요
→ □ 설치 방법
   ㅇ 사전 준비
   ㅇ 설치 단계 (표)
→ □ 주요 기능
   ㅇ 카테고리별 (표)
→ □ 사용 예시
→ □ 주의사항
→ * 각주
```

### 회의록

```
제목 → 날짜 (회의 일시 포함)
→ □ 회의 개요 (일시/장소/참석자 ㅇ)
→ □ 안건별 논의
   ㅇ 안건1 (ㆍ 논의 내용, ㆍ 결정 사항)
→ □ 결정 사항 요약 (표)
→ □ 향후 일정
```

---

## 주의사항

1. **build_document 사용 필수** — 개별 insert_paragraph 반복 금지.
2. **제목은 paragraph 0** — create_document 직후 첫 단락이 제목.
3. **표 data 는 2D 배열** — `data: [["헤더1","헤더2"], ["값1","값2"]]`.
4. **bold/italic/underline 미지정 = false** — build_document 가 자동 리셋.
5. **font_size 미지정 = 문서 기본값** (10pt) — DGIST 서식 따르려면 명시 필수.
6. **파일 확장자**: `.hwpx` 필수 (`.hwp` 불가).
7. **색상 형식**: `#` 없이 6자리 hex (예: `E5E5E5`, `000000`).
8. **margin_left 단위**: pt (4pt ≈ 1.4mm). 계층별 들여쓰기는 기호로 표현하고 margin_left 는 보조적으로만.
9. **폰트명은 후처리로 지정** — `build_document` 에는 `font_name` 필드가 없으므로, 본문 생성 후 `set_text_style`(`font_name` 파라미터)로 제목/본문/각주에 각각 지정. 셀 내부 폰트 변경도 동일 도구의 `table_index`/`row`/`col` 로 가능.
10. **셀별 정밀 스타일도 후처리로** — 헤더 외 셀의 배경색·폰트·정렬·병합은 `set_cell_background_color` / `set_text_style`(셀 타겟) / `merge_cells` 등 개별 도구 조합.

---

## 템플릿 모드 워크플로

사용자가 "**○○ 서식으로**", "**○○ 양식으로**", "**○○ 템플릿으로**" 작성을 요청한 경우.

### 단계

```
Step 1. 템플릿 선택 — 위 "사용 가능한 템플릿" 표에서 트리거 키워드 매칭 → 파일명 결정.

Step 2. 템플릿 절대경로 확보 (환경 독립)
   Glob(pattern: "**/skills/templates/<파일명>")
   → 첫 번째 결과 = <TEMPLATE_PATH>

Step 3. 출력 경로 결정 (사용자 미지정 시)
   <OUTPUT_PATH> = ~/Downloads/<자동생성 파일명>.hwpx
   (기본 파일명 규칙은 "저장 경로/파일명 기본 규칙" 섹션 참조)

Step 4. 템플릿 복사 (원본 보존)
   Bash: cp "<TEMPLATE_PATH>" "<OUTPUT_PATH>"

Step 5. 복사본 열기
   open_document({ file_path: "<OUTPUT_PATH>" })
   → { doc_id }

Step 6. 구조 파악 (필수 — placeholder 위치 확인)
   get_paragraphs({ doc_id }) + get_tables({ doc_id })
   (또는 find_paragraph_by_text 로 특정 placeholder 검색)

Step 7. 내용 치환 (병렬 호출 권장)
   - 단락 placeholder: update_paragraph_text_preserve_styles 또는 update_paragraph_text
   - 테이블 셀 placeholder: update_table_cell
   - 단일 호출에 여러 도구 실행 가능 (한 메시지에 multiple tool_use 블록)

Step 8. 저장 + 정리
   save_document({ doc_id, create_backup: false, verify_integrity: true })
   close_document({ doc_id })
```

### 주의

- **템플릿을 build_document 로 재구성하지 말 것.** 템플릿은 이미 완성된 서식이므로, 복사 후 내용만 바꾼다.
- `update_paragraph_text_preserve_styles` 는 기존 run 의 폰트·크기·색을 보존. 단순 `update_paragraph_text` 는 첫 run 만 유지하고 나머지 run 을 비우므로 스타일 강조가 있던 단락에는 `_preserve_styles` 쪽이 안전.
- 템플릿에 원래 있던 참고용 섹션 (예: 작성지침, 예시 데이터) 중 **사용자가 바꾸지 않은 부분은 그대로 둠**. 삭제는 명시 요청이 있을 때만.
- 저장 경로 미지정이어도 되묻지 말고 기본 규칙대로 `~/Downloads/` 에 저장 (자유 작성 모드와 동일).

### 예시 — "공문서 서식으로 업무보고 작성해줘"

```
1. Glob("**/skills/templates/공문서.hwpx") → /path/to/skills/templates/공문서.hwpx
2. cp → ~/Downloads/업무보고_2026-04-21.hwpx
3. open_document → doc_id
4. get_paragraphs / get_tables → placeholder 인덱스 파악
5. (병렬) update_table_cell (제목), update_paragraph_text (날짜/부서),
          update_table_cell (개요), update_paragraph_text_preserve_styles (□/ㅇ/- 내용) ...
6. save_document + close_document
```

---

## 참고

- **GitHub**: https://github.com/Dayoooun/hwpx-mcp
- **템플릿 위치**: `skills/templates/` (환경 독립 — Glob 으로 해결)
- **템플릿 출처**: DGIST 정보전산팀 공문서 양식
- **MCP 도구 수**: 133개 (main 브랜치, 2026-04-20 실측)
- **핵심 도구**:
  - 자유 작성 모드: `build_document` (일괄 작성) + 선택적 후처리
  - 템플릿 모드: `open_document` + `update_paragraph_text_preserve_styles` / `update_table_cell` + `save_document`
