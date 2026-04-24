---
name: hwpx-document-writer
description: HWPX 한글 문서를 3개 모드로 작성하는 스킬. 사용자가 "한글 문서 작성", "hwpx 파일", "보고서 한글로 저장", "공문서 작성", "○○ 서식으로 작성", "○○ 양식으로 작성", "업무추진비 / 집행내역서 작성", "공문서 서식으로 작성", "DGIST 공문" 등을 요청하면 이 스킬을 사용한다. hwpx-mcp 도구 사용 작업은 무조건 이 스킬을 먼저 참고할 것.
---

# HWPX 한글 문서 작성 스킬 (v2 — 3모드 아키텍처)

## 작성 모드 결정 (가장 먼저)

사용자 요청 → 아래 3개 모드 중 하나를 고른다. 잘못된 모드를 고르면 토큰을 낭비하거나 서식이 깨진다.

| 사용자 발화 패턴 | 모드 | 특징 |
|-----------------|------|------|
| "업무추진비 집행내역서 써줘", "○○ 양식 그대로 채워줘" (= 고정 양식에 **빈칸만** 채우는 경우) | **(A) 폼필 모드** | 템플릿 복사 → `batch_replace` 1회 → 저장. 구조/서식 그대로. |
| "공문서 서식으로 ○○ 보고", "DGIST 공문 양식으로 ○○ 작성" (= 서식 스타일은 따르되 **내용 구조는 자유**) | **(B) 스타일팔레트 모드** | 템플릿 복사 → `build_document({ template_profile, preset, ... })` 1회 → 저장. |
| 그 외 ("보고서 써줘", "회의록 만들어줘", 서식 언급 없음) | **(C) 자유 작성 모드** | `create_document` → `build_document` (inline 스타일) → 저장. |

> **모호하면**: 사용자 요청에 "공문서 / 공문 / 서식 / 양식" 이 있는데 **구체적인 양식 이름이 없으면** (B). **구체적인 양식 이름이 있으면** (A). 언급 자체가 없으면 (C).

---

## 사용 가능한 템플릿

**템플릿 폴더 (고정 경로)**:
- macOS: `~/Documents/skills/templates/` (실패 시 `/Users/<user>/Documents/skills/templates/`)
- Windows: `%USERPROFILE%\Documents\skills\templates\`

| 파일명 | 트리거 키워드 | 모드 | 비고 |
|--------|--------------|------|------|
| `공문서_프레임.hwpx` | "공문서", "공문", "공문 서식", "DGIST 공문", "보고서 서식", "기본 서식", "표준 서식" | **(B) 스타일팔레트** | 제목/날짜/개요 + 빈 본문 슬롯. 본문은 `build_document` 로 직접 생성. (표준 작성지침 블록은 템플릿에서 제거됨 — 아래 "공문서 프레임 원본 작성지침" 참고.) |
| `업무추진비_집행내역서.hwpx` | "업무추진비", "업무비", "집행내역서", "업무추진비 서식" | **(A) 폼필** | 14개 placeholder 이미 주입됨. |

> **중요 — Skills vs MCP 파일시스템**: Claude Skills 는 Anthropic 샌드박스에서 실행되지만 `hwpx-mcp` 는 **사용자 로컬 Mac/Windows** 에서 실행된다. 두 파일시스템은 분리돼 있으므로, `cp` 나 `open_document` 에 넘기는 경로는 반드시 **로컬 절대경로** 여야 한다.

---

## 모드 (A) 폼필 모드 — `업무추진비_집행내역서.hwpx` 등

**핵심**: 템플릿의 구조·서식 그대로. Placeholder 값만 치환.

### 단계 (MCP 호출 5회)

```
Step 1. 홈 디렉터리 조회 — Bash("echo $HOME") / Windows: cmd "echo %USERPROFILE%"
Step 2. 템플릿 복사 (cp) — 원본 보존:
        ~/Documents/skills/templates/업무추진비_집행내역서.hwpx
        → ~/Downloads/<자동파일명>.hwpx
Step 3. open_document({ file_path: <복사본 절대경로> })  → { doc_id }
Step 4. batch_replace({ doc_id, replacements: [ /* 모든 placeholder */ ] })
Step 5. save_document + close_document (sequential)
```

### `업무추진비_집행내역서.hwpx` Placeholder 맵

| Placeholder | 설명 | 예시 |
|-------------|------|------|
| `{{부서}}` | 부서명 | `정보전산팀` |
| `{{사용자}}` | 집행자 | `김○○` |
| `{{일자}}` | 집행 일자 | `2026-04-23` |
| `{{장소}}` | 집행 장소 | `대구시 달성군 ○○○식당` |
| `{{목적}}` | 업무 목적 | `2026년 AI 교육 기획 회의` |
| `{{참석자수}}` | 참석자 총인원 | `4` |
| `{{참석자1}}` `{{참석자2}}` `{{참석자3}}` | 개별 참석자 | 이름 |
| `{{금액한글}}` | 총액 한글 | `팔만사천원` |
| `{{금액}}` | 총액 숫자 | `84,000` |
| `{{1인금액}}` | 1인당 금액 | `21,000` |
| `{{회의내용1}}` `{{회의내용2}}` | 회의 요약 | 2줄까지 |

> **사용자가 값 미지정 시**: 빈 문자열(`""`)로 치환. 구조가 깨지지 않는다.

---

## 모드 (B) 스타일팔레트 모드 — `공문서_프레임.hwpx`

**핵심**: 템플릿이 가진 paraPr / charPr 서식 팔레트만 재사용하고, 본문 구조는 AI 가 자유롭게 구성. `build_document` 가 `template_profile: "gongmun_v1"` 로 서명된 문서의 팔레트를 검증하고 각 paragraph/table 에 preset 으로 지정한 서식을 찍어준다.

### 단계 (MCP 호출 5~6회)

```
Step 1. Bash("echo $HOME")
Step 2. cp ~/Documents/skills/templates/공문서_프레임.hwpx  →  ~/Downloads/<자동파일명>.hwpx
Step 3. open_document({ file_path }) → { doc_id }
Step 4. batch_replace 로 제목/날짜/부서/개요 placeholder 치환:
        {{title}} {{date}} {{dept}} {{summary}}
Step 5. build_document({ doc_id, template_profile: "gongmun_v1", after_index: 7, elements: [ ... ] })
Step 6. save_document + close_document
```

> **왜 `after_index: 7`?** `공문서_프레임.hwpx` 는 처음 7개 paragraph/table 요소(title 래퍼+nested tbl / 날짜 / 빈 문단 / summary 래퍼+nested tbl / 빈 문단)가 제목·날짜·개요 프레임이고, 이후부터 본문 자리다. 표준 작성지침 블록은 템플릿에서 제거됐으므로 **본문은 `after_index: 6` (= 마지막 빈 문단 뒤)** 로 삽입하면 바로 이어진다. (mem index — `getElementCount() - 1` 로 런타임에 확인 권장.)

### `공문서_프레임.hwpx` Placeholder 맵 (batch_replace)

| Placeholder | 위치 | 설명 |
|-------------|------|------|
| `{{title}}` | 제목 장식 테이블 | 문서 제목 (HY헤드라인M 20pt) |
| `{{date}}` | 날짜 단락 (우측) | 문서 일자 예: `'26. 4. 23` |
| `{{dept}}` | 날짜 단락 (우측) | 작성 부서 |
| `{{summary}}` | 개요 박스 (1×1 표) | 문서 취지 요약 (한두 문장) |

### `build_document` 프리셋 카탈로그 — gongmun_v1

**단락 (paragraph) preset**

| Preset | 용도 | 기호 | 실측 서식 |
|--------|------|------|-----------|
| `title` | (대체로 batch_replace 로 처리) | — | HY헤드라인M 20pt CENTER |
| `date` | 날짜·부서 단락 | `< ... >` | 휴먼고딕 12pt RIGHT |
| `summary` | 개요 박스 내부 | — | 한양중고딕 13pt |
| `heading` | **대분류** | `□` | HY헤드라인M 15pt JUSTIFY 165% |
| `point` | **중분류** | ` ㅇ` (한 칸 띄움) | 휴먼명조 15pt |
| `detail` | **소분류** | `  -` (두 칸) | 휴먼명조 15pt |
| `subdetail` | **세부** | `   ㆍ` (세 칸) | 휴먼명조 13pt |
| `footnote` | **각주** | `     *` (다섯 칸) | 한양중고딕 13pt |
| `table_title` | 표 제목 | `<표제>` | 한양중고딕 12pt BOLD LEFT |
| `table_unit` | 표 단위·기준일 | `(단위: …)` | 한양중고딕 10pt RIGHT |
| `table_note` | 표 주석 | `주: …` | 한양중고딕 10pt LEFT |

**표 셀 (table cell) preset** — build_document 의 `header_preset` / `body_preset` 에 사용.

| Preset | 용도 | 실측 서식 |
|--------|------|-----------|
| `table_header` | 행 0 (헤더) | 한양중고딕 12pt BOLD CENTER 130% |
| `table_body` | 행 1..n-1 (본문) | 한양중고딕 12pt JUSTIFY 130% |

### build_document 호출 예시 (공문서 모드)

```json
build_document({
  "doc_id": "...",
  "template_profile": "gongmun_v1",
  "after_index": 7,
  "elements": [
    { "type": "paragraph", "text": "□ 추진 배경", "preset": "heading" },
    { "type": "paragraph", "text": " ㅇ 2026년 대비 교육 수요 확대", "preset": "point" },
    { "type": "paragraph", "text": "  - 바이브 코딩·노코드 수요 급증", "preset": "detail" },
    { "type": "paragraph", "text": "   ㆍ 전년도 교육 만족도 4.6/5.0 기록", "preset": "subdetail" },
    { "type": "paragraph", "text": "     * 출처: 2025년 교육 결과보고", "preset": "footnote" },

    { "type": "paragraph", "text": "□ 교육 일정 (안)", "preset": "heading" },
    { "type": "paragraph", "text": "<2026년 교육 차수별 계획>", "preset": "table_title" },
    {
      "type": "table", "rows": 5, "cols": 3,
      "header_preset": "table_header",
      "body_preset": "table_body",
      "col_widths": [8000, 22000, 12520],
      "data": [
        ["차수·일정", "교육 주제", "시간·정원"],
        ["1차 / 5.20(수)", "AI 기초역량 및 챗봇 제작", "3H·40명"],
        ["2차 / 6.26(금)", "AI 미디어 콘텐츠 제작", "4H·40명"],
        ["3차 / 7.22(수)", "노코드 기반 업무 자동화", "6H·40명"],
        ["4차 / 8.19(수)", "바이브 코딩 기반 도구 제작", "6H·40명"]
      ]
    },
    { "type": "paragraph", "text": "주: 일정은 학사 운영 상황에 따라 조정 가능", "preset": "table_note" }
  ]
})
```

### 규칙

1. **본문 hierarchy 는 기호로 표시**. 들여쓰기용 공백은 위 표의 "앞 공백" 컬럼대로 붙인다.
   - `□` → 앞 공백 0, `ㅇ` → 1칸, `-` → 2칸, `ㆍ` → 3칸, `*` → 5칸
   - 실제 pt 단위 내어쓰기는 preset 의 paraPr 가 처리하므로 **공백은 시각 보조용**.
2. **필요한 만큼만 반복**. 1~4개 섹션 자유. 섹션 수 제한 없음.
3. **표는 본문 어디에나**. `build_document` elements 배열 안에서 paragraph 와 table 을 자유롭게 섞는다.
4. **preset 이 있으면 inline 스타일은 무시**. `font_size`/`bold`/`align` 등은 preset 이 없을 때만 효력. 스타일팔레트 모드에서는 preset 만 쓰고 inline 은 남기지 말 것.
5. **profile fingerprint 검증**: 잘못된 파일에 `template_profile: "gongmun_v1"` 을 쓰면 서버가 에러로 응답한다. 항상 올바른 템플릿(`공문서_프레임.hwpx`)을 열 것.

---

## 모드 (C) 자유 작성 모드

**핵심**: 템플릿 없이 `create_document` → `build_document` (inline 스타일) → 저장. AI 가 결정한 구조·폰트·표 구성을 그대로 HWPX 로 옮긴다.

### 단계 (MCP 호출 6회 + 선택적 후처리)

```
Step 1. create_document({ title, creator }) → { doc_id }
Step 2. (병렬 3회) update_paragraph_text + set_paragraph_style + set_text_style  (제목 설정)
Step 3. build_document({ doc_id, after_index: 0, elements: [ ... inline-styled ... ] })
Step 4. save_document
```

### build_document inline 스타일 필드

- `text`, `align` (left/center/right/justify/distribute)
- `bold`, `italic`, `underline`, `font_size` (pt), `font_color` (hex, `#` 없이)
- `margin_left`, `margin_right`, `margin_top`, `margin_bottom` (pt), `line_spacing` (%)
- 표: `rows`, `cols`, `col_widths` (hwpunit 배열), `data` (2D), `header_bg_color`, `header_font_color`, `header_align`

### 문서 구조 작성 원칙 (자유 작성 모드)

- **모든 문서는 계층이 있다**. AI 가 직접 설계:
  - 1단계: 대분류 (제목 또는 □ 리더) — 15pt bold 권장
  - 2단계: 중분류 (ㅇ) — 14pt
  - 3단계: 소분류 (-) — 14pt
  - 4단계: 세부 (ㆍ) — 13pt
  - 5단계: 각주 (*) — 13pt
- **표는 필요할 때 삽입**. 3~5열 권장. 헤더 배경색 `E5E5E5`, 폰트 검정.
- **줄 간격**: 본문 160%, 제목 165%, 표 130%, 각주 145%.
- **A4 기본 여백**: 좌우 20mm, 상하 15mm.

> 자유 작성 모드는 사용자의 제목/설명을 바탕으로 AI 가 다음을 결정한다: (1) 섹션 개수, (2) 각 섹션의 계층 깊이, (3) 표 삽입 여부 및 위치. 고정된 템플릿 없음.

---

## 저장 경로/파일명 기본 규칙 (3모드 공통)

사용자 미지정 시:
- **경로**: `~/Downloads/` / `%USERPROFILE%\Downloads\`
- **파일명**: 문서 제목 → 공백→`_`, 특수문자(`/ \ : * ? " < > |`) 제거, 확장자 `.hwpx`
- 예: `정보전산팀_2026년_AI_교육_계획.hwpx`

되묻지 말고 자동 결정 후 저장 메시지에 최종 경로 명시.

---

## 도구 사용 가이드 — 3모드 공통

### 필수 도구

- `create_document` — 자유 작성 모드 전용
- `open_document` — 폼필 / 스타일팔레트 모드 진입
- `batch_replace` — placeholder 일괄 치환 (폼필 필수, 스타일팔레트 권장)
- `build_document` — **모든 본문 생성의 중심**. `template_profile` + `preset` 지원.
- `list_template_profiles` — 어떤 preset 이 있는지 모를 때 조회 (보통은 스킬의 preset 표 참조로 충분)
- `save_document` — 반드시 호출. build/replace 만으로는 메모리에만 남음.
- `close_document` — 세션 정리.

### 금지 사항

- **`insert_paragraph` 반복 호출 금지** — 언제나 `build_document` 사용 (토큰 낭비).
- 스타일팔레트 모드에서 inline style (`font_size`, `bold` 등) 사용 금지 — preset 과 혼용하면 혼동의 원인.
- 폼필 모드에서 `get_paragraphs` / `get_tables` / 개별 `update_paragraph_text` 호출 금지 — batch_replace 1회면 충분.

### 스타일팔레트 모드 실패 처리

`build_document` 가 `template_profile "gongmun_v1" does not match this document's style palette` 로 실패하면:
1. 올바른 템플릿(`공문서_프레임.hwpx`)을 열었는지 확인.
2. 파일이 손상/수정됐다면 템플릿 폴더에서 재복사.
3. 자유 작성 모드로 폴백하고 사용자에게 "서식 검증에 실패해서 자유형으로 생성했다" 고 안내.

---

## 빠른 참조 — 어떤 모드를 선택할지

```
사용자 요청을 읽는다
  │
  ├─ "○○ 양식 그대로 / 집행내역서 / 업무추진비" 같이 고정 양식
  │     → 모드 (A) 폼필 — batch_replace 로 빈칸만 채움
  │
  ├─ "공문서 서식으로 / DGIST 공문 / 보고서 양식" + 자유로운 본문
  │     → 모드 (B) 스타일팔레트 — template_profile:"gongmun_v1" + preset
  │
  └─ 그 외 (보고서, 회의록, 안내문, 계획서 ...)
        → 모드 (C) 자유 작성 — inline 스타일로 build_document
```

---

## 참고

- **MCP 도구 수**: 133+ (v0.5.0)
- **템플릿 버전**: 2026-04-24 기준 (표준 작성지침 블록 제거 후)
- **프로필 등록 위치**: `mcp-server/src/TemplateProfiles.ts` — 새 프로필 추가 시 여기에 preset 매핑 + assertions 추가.
- **GitHub**: https://github.com/Dayoooun/hwpx-mcp

---

## 공문서 프레임 원본 작성지침 (참고 · 템플릿에서 제거됨)

`공문서_프레임.hwpx` 원본(DGIST 정보전산팀 배포본)에는 문서 끝에 아래 `표준 작성지침` 블록이 포함돼 있었다. 본 스킬에서는 작성 편의를 위해 템플릿에서 이 블록을 제거하고 여기에 원문을 보존한다. 서식 준수 기준은 동일하다.

> **< 표준 작성지침 >**
> - ▷ **편집용지** : 좌·우(20mm), 위·아래(15mm), 머리말·꼬리말(10mm)
> - ▷ **문단모양** : 양쪽정렬
> - ▷ **문단위 간격** : 중고딕체는 0pt, 나머지는 5pt
> - ▷ **줄 간격** : 160%
> - ▷ **제목 정렬** : 그림제목은 '가운데 정렬', 표제목은 '왼쪽 정렬'
> - ▷ **표 형식** : 테두리 0.12mm, 표 내용 줄간격 130%, 중고딕 12pt (주석은 중고딕 10pt)

위 규칙은 "서식 규칙 (DGIST 공문서 실측 기준)" 섹션에 이미 반영돼 있다. Mode (B) / (C) 로 본문을 생성할 때 `template_profile: "gongmun_v1"` 프로필이 위 값들을 preset 으로 자동 적용하므로, 기본값만 써도 위 지침과 일치한다.
