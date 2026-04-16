---
name: hwpx-document-writer
description: DGIST 정보전산팀 공문서 형식으로 HWPX 한글 문서를 작성하는 스킬. 사용자가 "한글 문서 작성", "hwpx 파일 만들어줘", "보고서 한글로 저장", "hwpx로 작성", "한글 파일 생성", "공문서 작성", "보고서 작성해서 저장", "한글 문서 저장" 등의 요청을 하면 이 스킬을 사용한다. hwpx-mcp 도구를 사용하여 한글(HWPX) 문서를 작성하는 작업이면 무조건 이 스킬을 먼저 참고할 것.
---

# HWPX 한글 문서 작성 스킬 (build_document 방식)

## 핵심 원칙

**`build_document` 도구를 사용하여 한 번의 호출로 전체 문서를 작성한다.**
개별 `insert_paragraph`/`set_text_style` 호출을 반복하지 않는다.

---

## 작성 절차 (3단계)

### Step 1. 문서 생성 + 제목 설정

```
create_document({ title: "문서 제목", creator: "작성자" })
→ returns { doc_id: "abc123" }
```

첫 번째 단락(index 0)은 제목으로 사용:
```
update_paragraph_text({ doc_id: "abc123", section_index: 0, paragraph_index: 0, text: "제목 텍스트" })
set_paragraph_style({ doc_id: "abc123", section_index: 0, paragraph_index: 0, align: "center" })
set_text_style({ doc_id: "abc123", section_index: 0, paragraph_index: 0, bold: true, font_size: 18 })
```

> 위 3개 호출은 **병렬** 실행 가능 (doc_id는 create_document의 반환값 사용)

### Step 2. build_document로 본문 일괄 작성

`after_index: 0` 으로 제목 다음에 모든 요소를 한 번에 삽입:

```json
build_document({
  doc_id: "...",
  after_index: 0,
  elements: [
    // 부제목
    { type: "paragraph", text: "- 부제목 -", align: "center",
      bold: true, underline: true, font_size: 14, margin_bottom: 5 },

    // 날짜
    { type: "paragraph", text: "< '26. 4. 15 / 정보전산팀 >",
      align: "right", font_size: 11, margin_bottom: 8 },

    // 개요 박스 (1×1 표)
    { type: "table", rows: 1, cols: 1,
      data: [["개요 내용을 여기에 작성"]] },

    // 대분류
    { type: "paragraph", text: "1. 대분류 제목",
      bold: true, font_size: 16, margin_top: 10 },

    // 중분류
    { type: "paragraph", text: "  가. 중분류 제목",
      bold: true, font_size: 14, margin_left: 4 },

    // 소분류
    { type: "paragraph", text: "    ㅇ 본문 내용",
      font_size: 11, margin_left: 8 },

    // 세부항목
    { type: "paragraph", text: "      · 세부 내용",
      font_size: 10, margin_left: 12 },

    // 표 (헤더 배경색 + 흰색 글자 + 가운데 정렬)
    { type: "table", rows: 4, cols: 3,
      header_bg_color: "2B579A", header_font_color: "FFFFFF",
      header_align: "center",
      col_widths: [8000, 16000, 18520],
      data: [
        ["구분", "항목A", "항목B"],
        ["행1", "내용1", "내용2"],
        ["행2", "내용3", "내용4"],
        ["행3", "내용5", "내용6"]
      ] },

    // 각주
    { type: "paragraph", text: "* 각주 내용", font_size: 9, margin_top: 3 }
  ]
})
```

### Step 3. 저장 (필수)

**반드시 save_document를 호출해야 파일이 디스크에 저장된다.** build_document만 호출하면 메모리에만 존재한다.

```
save_document({ doc_id: "abc123", output_path: "/path/to/output.hwpx",
                create_backup: true, verify_integrity: true })
```

**저장 경로/파일명 기본 규칙 (사용자가 명시하지 않은 경우)**:

- **경로**: `~/Downloads/` (macOS/Linux) 또는 `%USERPROFILE%\Downloads\` (Windows)
- **파일명**: 문서 제목에서 자동 생성
  - 공백 → 언더스코어(`_`)
  - 특수문자 제거 (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
  - 확장자: `.hwpx`
  - 예: "iM 유니즈 업무협약서 검토 보고" → `iM_유니즈_업무협약서_검토_보고.hwpx`
  - 날짜가 필요하면: `회의록_2026-04-16.hwpx`

**예시**:
```
사용자: "회의록 작성해서 저장해줘"
→ save_document({ doc_id, output_path: "/Users/<user>/Downloads/회의록.hwpx",
                  create_backup: true, verify_integrity: true })
```

**총 MCP 호출: 6회** (create + title 3병렬 + build_document + save)

> **중요**: 사용자가 경로/파일명을 명시하지 않아도 **절대 물어보지 말고** 기본 규칙대로 저장한 뒤, 저장 완료 메시지에 경로를 포함해 알려준다.

---

## 서식 규칙 (DGIST 공문서 기준)

### 계층별 스타일

| 레벨 | 기호 | font_size | bold | margin_left |
|------|------|-----------|------|-------------|
| 제목 | - | 18 | true | 0 (center) |
| 부제목 | - | 14 | true + underline | 0 (center) |
| 날짜 | - | 11 | false | 0 (right) |
| 대분류 | 1., 2., 3. | 16 | true | 0 |
| 중분류 | 가., 나., 다. | 14 | true | 4 |
| 소분류 | ㅇ | 11 | false | 8 |
| 세부항목 | · | 10~11 | false | 12 |
| 각주 | *, ** | 9 | false | 0 |

### 간격 (margin_top / margin_bottom)

- 대분류 앞: `margin_top: 10`
- 중분류 앞: `margin_top: 5` (선택)
- 섹션 간 구분: `margin_bottom: 8~10`
- 각주 앞: `margin_top: 3`

### 표(Table) 스타일

| 속성 | 헤더 행 | 데이터 행 |
|------|---------|----------|
| 배경색 | `header_bg_color: "2B579A"` | 없음 (흰색) |
| 글자색 | `header_font_color: "FFFFFF"` | 검정 (기본) |
| 정렬 | `header_align: "center"` | 왼쪽 (기본) |
| 글자 | 굵게 (자동) | 일반 |

> 배경색 코드: 파란계열 `2B579A`, 회색 `D9D9D9`, 진회색 `404040`

### 열 너비 (col_widths)

전체 너비 = 42520 hwpunit. 열 수에 맞게 배분:

| 열 수 | 추천 col_widths |
|-------|----------------|
| 2열 | `[10000, 32520]` |
| 3열 (균등) | `[14000, 14000, 14520]` |
| 3열 (1:2:3) | `[7000, 14000, 21520]` |
| 3열 (구분+비교) | `[6000, 18000, 18520]` |

---

## 문서 유형별 패턴

### 보고서 (계획/결과 보고)

```
제목 → 부제목 → 날짜 → 개요박스
→ 1. 추진 배경
  가. 현황 (ㅇ 항목들)
  나. 추진계획 (표)
  * 각주
→ 2. 세부 내용
  가. 방안 비교 (비교표)
  나. 기대 효과 (ㅇ 항목들)
```

### 안내문/가이드

```
제목 → 부제목 → 날짜 → 개요박스
→ 1. 개요
→ 2. 설치/설정 방법 (단계별)
→ 3. 주요 기능 (카테고리 표)
→ 4. 사용 예시
→ 5. 주의사항
→ 각주
```

---

## 주의사항

1. **build_document 사용 필수**: 개별 insert_paragraph 반복 금지 (토큰 낭비)
2. **제목은 paragraph 0**: create_document 후 첫 단락을 제목으로 활용
3. **표 데이터는 2D 배열**: `data: [["헤더1","헤더2"], ["값1","값2"]]`
4. **bold 미지정 = false**: build_document는 자동으로 bold/italic/underline을 false로 리셋
5. **font_size 미지정 = 문서 기본값**: 보통 10pt (명시 권장)
6. **파일 확장자**: 반드시 `.hwpx` (`.hwp` 불가)
7. **색상 형식**: `#` 없이 6자리 hex (예: `2B579A`, `FFFFFF`)
8. **margin_left 단위**: pt (4 = 약 1.4mm)

---

## 참고

- GitHub: https://github.com/Dayoooun/hwpx-mcp
- 템플릿 출처: DGIST 정보전산팀 공문서 양식 ('26.4.4)
- MCP 도구 수: 132개
- 핵심 도구: `build_document` (문서 일괄 작성)
