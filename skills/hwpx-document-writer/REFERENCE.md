# HWPX 문서 작성 REFERENCE (상세 서식 매뉴얼)

`SKILL.md` 에서 지시받을 때만 로드. 모드별 해당 섹션만 읽으면 충분.

---

## Mode A placeholder — `업무추진비_집행내역서.hwpx`

`batch_replace({ doc_id, replacements: [ ... ] })` 호출에 아래 14개 전부 포함. 사용자 미지정 시 빈 문자열(`""`) 로 치환. **절대 일부만 치환하고 끝내지 말 것.**

| Placeholder | 설명 | 예시 |
|-------------|------|------|
| `{{부서}}` | 집행 부서 | `정보전산팀` |
| `{{사용자}}` | 집행 책임자 성명 | `김○○` |
| `{{일자}}` | 집행 일자 (YYYY-MM-DD) | `2026-04-23` |
| `{{장소}}` | 집행 장소 | `대구광역시 달성군 ○○식당` |
| `{{목적}}` | 업무 목적 (한두 문장) | `2026년 AI 교육 기획 회의` |
| `{{참석자수}}` | 참석자 총 인원 (숫자) | `4` |
| `{{참석자1}}` | 참석자 이름 1 | `홍길동` |
| `{{참석자2}}` | 참석자 이름 2 | `김철수` |
| `{{참석자3}}` | 참석자 이름 3 | `이영희` |
| `{{금액한글}}` | 총액 (한글) | `팔만사천원` |
| `{{금액}}` | 총액 (숫자, 쉼표 포함) | `84,000` |
| `{{1인금액}}` | 1인당 환산 금액 | `21,000` |
| `{{회의내용1}}` | 회의 요약 1줄 | `2026년 AI 교육 로드맵 초안 검토` |
| `{{회의내용2}}` | 회의 요약 1줄 | `과정별 강사 섭외 계획 논의` |

참석자가 4명 이상이어도 템플릿은 3명 필드만 있음 → 나머지는 `{{회의내용1}}` 안에 풀어서 기재하거나 별도 요청.

---

## Mode B 상세 — `공문서_프레임.hwpx` + `gongmun_v1` 프로필

### 템플릿 구조 (전처리된 프레임 — 고정)

```
mem index 0-1: 제목 장식 박스 (paragraph 래퍼 + nested tbl)  — {{title}}
mem index 2  : 날짜/부서 단락 (우측정렬)                      — {{date}} / {{dept}}
mem index 3  : 빈 단락 (spacer)
mem index 4-5: 개요 박스 (paragraph 래퍼 + nested tbl)        — {{summary}}
mem index 6  : 빈 단락 (본문 시작 위치 직전)                   ← after_index: 6
```

### 치환 (batch_replace)

4개 placeholder. **순서·이름 엄수**:

```json
{
  "doc_id": "...",
  "replacements": [
    { "old_text": "{{title}}",   "new_text": "2026년 생성형 AI 교육 계획" },
    { "old_text": "{{date}}",    "new_text": "'26. 4. 24" },
    { "old_text": "{{dept}}",    "new_text": "정보전산팀" },
    { "old_text": "{{summary}}", "new_text": "…개요 한두 문장 요약…" }
  ]
}
```

### 본문 생성 (build_document + template_profile)

**필수 호출 형태**:
```json
{
  "doc_id": "...",
  "template_profile": "gongmun_v1",
  "after_index": 6,
  "elements": [ ... 아래 preset 사용 ... ]
}
```

> 프로필 카탈로그는 `list_template_profiles()` MCP 도구로 언제든 실시간 조회 가능 (아래 표는 2026-04-23 스탬프 기준 백업).

### gongmun_v1 paragraph preset 카탈로그

| preset | 용도 | 서식 (템플릿 실측) |
|--------|------|-------------------|
| `title` | 문서 제목 (장식 박스 내부) | HY헤드라인M 20pt, center, #0E1C2C |
| `date` | 날짜·부서 단락 | 휴먼고딕 12pt, right |
| `summary` | 개요 박스 내부 | 한양중고딕 13pt |
| `heading` | □ 대분류 | HY헤드라인M 15pt, 165% 줄간격 |
| `point` | ㅇ 중분류 | 휴먼명조 15pt |
| `detail` | - 소분류 | 휴먼명조 15pt |
| `subdetail` | ㆍ 세부 | 휴먼명조 13pt |
| `footnote` | \* 각주 | 한양중고딕 13pt |
| `table_title` | `<표 제목>` (표 앞 단락) | 한양중고딕 12pt BOLD, left |
| `table_unit` | `(단위/기준일)` (표 앞 단락) | right 10pt |
| `table_note` | `주: 표 주석` (표 뒤 단락) | left 10pt |

### gongmun_v1 table cell preset 카탈로그

| preset | 용도 | 서식 |
|--------|------|------|
| `table_header` | 표 헤더 행 | 한양중고딕 12pt BOLD, center, **회색(#E5E5E5) 배경 + 0.12mm 테두리** |
| `table_body` | 표 본문 행 | 한양중고딕 12pt, justify, 흰색 배경 + 0.12mm 테두리 |

### build_document 전체 예시

```json
{
  "doc_id": "...",
  "template_profile": "gongmun_v1",
  "after_index": 6,
  "elements": [
    { "type": "paragraph", "preset": "heading", "text": "□ 추진 배경" },
    { "type": "paragraph", "preset": "point",   "text": " ㅇ 생성형 AI 확산" },
    { "type": "paragraph", "preset": "detail",  "text": "  - ChatGPT, Claude 상용화" },
    { "type": "paragraph", "preset": "detail",  "text": "  - 업무 AI 활용 필수화" },

    { "type": "paragraph", "preset": "heading", "text": "□ 세부 교육 계획" },
    { "type": "paragraph", "preset": "table_title", "text": "<2026년 교육 과정>" },
    {
      "type": "table",
      "rows": 4, "cols": 4,
      "header_preset": "table_header",
      "body_preset": "table_body",
      "data": [
        ["구분", "과정명", "대상", "시수"],
        ["기초", "생성형 AI 입문", "전 구성원", "4시간"],
        ["심화", "프롬프트 엔지니어링", "연구·교직원", "8시간"],
        ["전문가", "AI 워크플로 구축", "연구자", "16시간"]
      ]
    },
    { "type": "paragraph", "preset": "table_note", "text": "주: 세부 일정은 분기별 공지" },

    { "type": "paragraph", "preset": "heading",   "text": "□ 기대 효과" },
    { "type": "paragraph", "preset": "point",     "text": " ㅇ 역량 상향 평준화" },
    { "type": "paragraph", "preset": "subdetail", "text": "   ㆍ 챔피언 양성" },
    { "type": "paragraph", "preset": "footnote",  "text": "     * 자료는 포털에 제공" }
  ]
}
```

### 계층 기호 + 앞 공백 규칙

| 레벨 | 기호 | 앞 공백 | preset |
|------|------|---------|--------|
| 대분류 | `□` | 0칸 | `heading` |
| 중분류 | `ㅇ` | 1칸 | `point` |
| 소분류 | `-`  | 2칸 | `detail` |
| 세부   | `ㆍ` | 3칸 | `subdetail` |
| 각주   | `*`  | 5칸 | `footnote` |

> preset 이 paraPrIDRef 로 내어쓰기 값을 이미 가지고 있으므로, 앞 공백은 **시각 백업** 용도. 사용자가 복사할 때 평문으로 구조가 보이도록.

### 금지 사항

- **`template_profile` + `preset` 사용 시 inline 스타일(`font_size`, `bold`, `font_color`, `align` 등) 절대 섞지 말 것**. 혼용하면 preset 이 덮어써서 의도와 다르게 찍힘.
- 표 안에서 셀별로 preset 을 바꾸려 하지 말 것. 행 단위로 `header_preset`/`body_preset` 적용이 원칙. 개별 셀 스타일 수정은 `set_cell_background_color` / `set_text_style` 로 저장 후 수정.

### 실패 시 진단

- `gongmun_v1 assertions failed: charPr[X].hangulFontFace: expected ..., got ...`
  → 템플릿이 변조됨. `~/Documents/skills/templates/공문서_프레임.hwpx` 를 원본 배포본으로 재복사.
- `template_profile "gongmun_v1" does not match`
  → 엉뚱한 파일(일반 hwpx) 에 호출됨. 올바른 `공문서_프레임.hwpx` 복사본을 열었는지 재확인.
- 에러 없이 성공했지만 스타일이 기본값(10pt 함초롬바탕) 으로만 찍힘
  → MCP 서버가 구 버전 (v0.4.x) 이라 `template_profile` 필드를 조용히 무시한 것. `list_template_profiles` 호출이 200 OK 를 주면 v0.5.0+ 정상.

---

## Mode C 상세 — 자유 작성

### DGIST 공문서 계층별 서식 표준 (실측 기준)

`build_document` 에 inline 스타일로 지정:

| 레벨 | 기호+공백 | font_size | 추천 font_name | firstLineIndent (pt) | line_spacing | margin_top |
|------|----------|-----------|----------------|----------------------|--------------|-----------|
| 제목 (장식 없음) | — | 20 | HY헤드라인M | — | 119~165 | — |
| 날짜 `< ... >` | — | 12~13 | HY헤드라인M / 휴먼고딕 | — | 165 | 0 |
| 대분류 `□` | 0칸 | 15 | HY헤드라인M | -27.3 | 165 | 0 |
| 중분류 ` ㅇ` | 1칸 | 14 | 휴먼명조 | -37.44 | 160 | 5 |
| 소분류 `  -` | 2칸 | 14 | 휴먼명조 | -36.6 | 160 | 5 |
| 세부 `   ㆍ` | 3칸 | 13 | 한양중고딕 | -44.92 | 160 | 5 |
| 각주 `     *` | 5칸 | 13 | 한양중고딕 | -56.64 | 160 | 0 |
| 표 제목 `<...>` | — | 13 | 휴먼명조 | — | 160 | 0 |
| 표 본문 | — | 12 | 한양중고딕 | — | 130 | — |
| 표 헤더 | — | 12~13 BOLD | 한양중고딕 | — | 130 | — |
| 표 주석 `주:` | — | 10 | 한양중고딕 | — | 160 | 3 |

### build_document inline 스타일 필드

```json
{
  "type": "paragraph",
  "text": "□ 추진 배경",
  "font_size": 15,
  "bold": false,
  "align": "left",
  "line_spacing": 165,
  "margin_top": 0,
  "margin_bottom": 0
}
```

지원 필드: `text`, `align` ("left"|"center"|"right"|"justify"), `font_size` (pt), `bold`, `italic`, `underline`, `font_color` ("RRGGBB"), `line_spacing` (%), `margin_top/bottom/left/right` (pt).

> **inline 스타일 버그 (v0.5.0 회귀 필요 — v0.4.x 확인)**: `font_size`/`bold`/`font_color` 를 inline 으로 주면 간혹 다음 단락으로 밀림. 증상 나타나면 저장→재로드 후 `set_text_style` 로 각 단락에 재적용.

> **정확한 내어쓰기는 inline 으로 불가**. `set_hanging_indent({ first_line_indent: -27.3, ... })` 를 각 단락에 별도 적용.

### 표 inline 설정

```json
{
  "type": "table",
  "rows": 4, "cols": 3,
  "header_bg_color": "E5E5E5",
  "header_font_color": "000000",
  "header_align": "center",
  "col_widths": [8000, 24520, 10000],
  "data": [
    ["구분", "항목A", "항목B"],
    ["행1", "값1", "값2"],
    ["행2", "값3", "값4"],
    ["행3", "값5", "값6"]
  ]
}
```

### 표 col_widths 권장 (total 42520 hwpunit)

| 열 수 | 권장 | 비고 |
|-------|------|------|
| 2열 | `[10000, 32520]` | 구분+내용 |
| 3열 (비대칭) | `[8000, 24520, 10000]` | 구분-설명-값 (공문서 비율) |
| 3열 (균등) | `[14000, 14000, 14520]` | 일반 |
| 4열 | `[10000, 10000, 10000, 12520]` | 구분+3항목 |

### 편집용지

- A4 세로, 좌우 20mm, 상하 15mm, 머리말·꼬리말 10mm
- 기본 줄간격 160%, 양쪽정렬
- `set_page_settings` 로 명시적 지정 가능

---

## 공통 주의

- **파일명은 반드시 `공문서_프레임.hwpx`** 로 literal 하게 사용. `공문서.hwpx` 는 존재하지 않는 파일명 (환각 주의).
- 색상은 `#` 없이 6자리 hex (`E5E5E5`, `000000`).
- 폰트명은 한글 이름 그대로 (`HY헤드라인M`, `휴먼명조`, `한양중고딕`, `휴먼고딕`, `함초롬바탕`, `함초롬돋움`).
- 저장 전 `save_document` 누락 시 디스크에 반영 안 됨 (메모리만 바뀜).
- `template_profile` + inline 스타일 혼용 금지.
