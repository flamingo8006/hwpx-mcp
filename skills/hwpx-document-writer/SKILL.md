---
name: hwpx-document-writer
description: HWPX 한글 문서를 3개 모드로 작성하는 스킬. 사용자가 "한글 문서 작성", "hwpx 파일", "보고서 한글로 저장", "공문서 작성", "○○ 서식으로 작성", "○○ 양식으로 작성", "업무추진비 / 집행내역서 작성", "공문서 서식으로 작성", "DGIST 공문" 등을 요청하면 이 스킬을 사용한다. hwpx-mcp 도구 사용 작업은 무조건 이 스킬을 먼저 참고할 것.
model: sonnet
allowed-tools:
  - mcp__hwpx__*
  - Read
---

# HWPX 한글 문서 작성 스킬

## Step 0 (모든 작업 공통 — 절대 건너뛰지 말 것)

**첫 번째로 정확히 한 번** `mcp__hwpx__get_user_paths` 를 호출해 사용자 PC 의 실제 경로를 확보. 결과를 `$PATHS` 로 저장하고 이후 같은 값 재사용 (중복 조회 금지).

> ⚠️ **Bash `echo $HOME` / `uname` / `dir` 같은 셸 명령으로 OS·HOME 을 추측하지 말 것.** Claude Desktop 환경에서 Bash 는 샌드박스 리눅스 컨테이너에서 실행돼 `$HOME=/root` 을 반환하며, 사용자의 실제 Windows/macOS 파일은 보이지 않는다. `get_user_paths` 는 MCP 서버(사용자 OS 계정에서 실행)가 돌려주는 **진짜** 경로다.

### get_user_paths 반환 예시

```json
{
  "os": "win32",                          // "darwin" / "win32" / "linux"
  "username": "<username>",
  "home": "C:\\Users\\<username>",
  "documents": "C:\\Users\\<username>\\Documents",
  "downloads": "C:\\Users\\<username>\\Downloads",
  "templates_dir": "C:\\Users\\<username>\\Documents\\skills\\templates",
  "templates_dir_exists": true,
  "templates": [
    { "filename": "공문서_프레임.hwpx",
      "path": "C:\\Users\\<username>\\Documents\\skills\\templates\\공문서_프레임.hwpx",
      "size": 32772 }
  ]
}
```

### 템플릿 선택 규칙

1. 모드 판정(아래 "모드 선택" 표) 후, 필요한 템플릿 파일명을 결정 (`공문서_프레임.hwpx` / `업무추진비_집행내역서.hwpx`).
2. `$PATHS.templates` 배열을 순회하며 `filename` 이 일치하는 엔트리 탐색 → 있으면 `.path` 를 절대경로로 사용.
3. 일치하는 엔트리가 없으면 **즉시 Mode C (자유 작성) 폴백** + 사용자에게 1줄 고지:
   > "⚠️ 템플릿(`<파일명>`)이 `<templates_dir>` 에 없어 자유 작성 모드로 진행합니다."

> **다른 경로 탐색 금지.** `$PATHS.templates_dir` 외의 폴더(`C:\Users\Public\...`, 다른 드라이브, 임의 폴더)는 시도하지 않는다. 없으면 없는 것.

---

## 모드 선택

| 사용자 발화 | 모드 | 템플릿 | 핵심 흐름 |
|---|---|---|---|
| "업무추진비 집행내역서", "○○ 양식 그대로 채워줘" | **(A) 폼필** | `업무추진비_집행내역서.hwpx` | Step 0 → cp → open → batch_replace → save |
| "공문서 서식으로 ○○ 보고", "DGIST 공문 양식으로" | **(B) 스타일팔레트** | `공문서_프레임.hwpx` | Step 0 → cp → open → batch_replace(제목/날짜) + build_document(본문) → save |
| 그 외 (보고서/회의록/안내문/계획서, 서식 언급 없음) | **(C) 자유** | — | create_document → build_document → save |

> **모호하면**: "서식/양식/공문" 만 있고 구체 이름 없으면 **(B)**. 구체 이름(업무추진비 등) 있으면 **(A)**. 언급 자체 없으면 **(C)**.

---

## Mode A — 폼필

**흐름** (MCP 4회 — Bash 불필요):
1. `open_document({ file_path: <templates[i].path> })` → `{ doc_id }`  — 템플릿을 직접 연다 (원본은 save 시점에 다른 경로로 저장되므로 불변).
2. `batch_replace({ doc_id, replacements: [ /* 14개 placeholder 전부 */ ] })`
3. `save_document({ doc_id, output_path: "<$PATHS.downloads>/<자동파일명>.hwpx" })`  — 원본 템플릿이 아닌 Downloads 에 저장됨.
4. `close_document({ doc_id })`

Placeholder 이름·예시는 **`REFERENCE.md` 의 "Mode A placeholder" 섹션** 참조 필수.

---

## Mode B — 스타일팔레트

**흐름** (MCP 5회 — Bash 불필요):
1. `open_document({ file_path: <templates[i].path> })` → `{ doc_id }`  — 템플릿 직접 열기.
2. `batch_replace({ doc_id, replacements: [ {{title}}, {{date}}, {{dept}}, {{summary}} ] })`
3. `build_document({ doc_id, template_profile: "gongmun_v1", after_index: 6, elements: [ ... preset 지정 ... ] })`
4. `save_document({ doc_id, output_path: "<$PATHS.downloads>/<자동파일명>.hwpx" })`
5. `close_document({ doc_id })`

**본문 preset 이름** (단락): `heading`(□), `point`(ㅇ), `detail`(-), `subdetail`(ㆍ), `footnote`(*), `table_title`, `table_note` / **(표)** `table_header`, `table_body`.

상세 서식 수치, 전체 preset 카탈로그, `build_document` 예시는 **`REFERENCE.md` 의 "Mode B 상세" 섹션** 참조 필수.

**규칙**:
- preset 사용 시 inline 스타일(`font_size`, `bold` 등) 금지 — 혼용하면 예측 불가
- hierarchy 는 기호로 표시(`□/ㅇ/-/ㆍ/*`) + 앞 공백(0/1/2/3/5칸)으로 시각 보조
- 섹션 수 제한 없음 — 필요한 만큼 반복

---

## Mode C — 자유 작성

**흐름** (MCP 6회):
1. `create_document({ title, creator })` → `{ doc_id }`
2. (병렬 3회) `update_paragraph_text` + `set_paragraph_style` + `set_text_style` (제목)
3. `build_document({ doc_id, after_index: 0, elements: [ ... inline 스타일 ... ] })`
4. `save_document({ doc_id, output_path: "<$PATHS.downloads>/<자동파일명>.hwpx" })`
5. `close_document({ doc_id })`

**inline 스타일 필드**, DGIST 계층 표준(폰트 크기·여백·줄간격), 표 폭 권장은 **`REFERENCE.md` 의 "Mode C 상세" 섹션** 참조.

**원칙**:
- 모든 문서는 계층 구조. 제목 → □(대) → ㅇ(중) → -(소) → ㆍ(세) → *(각주)
- 표는 필요한 곳에. 헤더 배경 `E5E5E5`, 글자 검정
- 줄간격: 본문 160%, 제목 165%, 표 130%
- A4 여백: 좌우 20mm, 상하 15mm

---

## 저장 경로·파일명 (3모드 공통)

사용자 미지정 시:
- 경로: `$PATHS.downloads` (Step 0 의 `get_user_paths` 결과에서 이미 확보됨)
- 파일명: 문서 제목 → 공백을 `_`로, 특수문자(`/ \ : * ? " < > |`) 제거, `.hwpx` 확장자
- path.join 은 `$PATHS.os === "win32"` 면 `\`, 아니면 `/` 로 조합 — 실무적으론 `save_document({ output_path })` 가 양쪽 구분자 모두 받아주므로 `<downloads>/<파일명>.hwpx` 포맷 그대로 넘겨도 무방
- 예: `정보전산팀_2026년_AI_교육_계획.hwpx`

되묻지 말고 자동 결정 후 저장 메시지에 최종 경로 포함.

---

## 도구 사용 핵심

### 필수
- `get_user_paths` — **Step 0 1회**. 실제 사용자 HOME/Downloads/템플릿 경로 확보 (Bash 로 대체 금지)
- `open_document` / `create_document` — 진입점
- `batch_replace` — Mode A 필수, Mode B 권장 (제목·날짜·개요)
- `build_document` — **본문 생성의 중심**. 모드 B 는 `template_profile` + `preset`, 모드 C 는 inline 스타일
- `save_document` — 반드시 `output_path` 와 함께 호출 (Downloads 로 저장, 원본 템플릿은 불변)
- `close_document` — 세션 정리

### 금지
- **Bash 로 경로·파일시스템 조작 금지** (`echo $HOME`, `cp`, `dir`, `ls`, `cmd /c` 등). Claude Desktop 샌드박스에서는 사용자 파일이 안 보이며, 경로 탐지는 무조건 `get_user_paths`, 파일 복제는 `save_document(output_path)` 로 대체.
- `insert_paragraph` 반복 호출 금지 → 언제나 `build_document`
- Mode B 에서 preset + inline 스타일 혼용 금지
- Mode A 에서 `get_paragraphs` / `update_paragraph_text` 개별 호출 금지 (batch_replace 1회로 충분)

### Mode B 서식 검증 실패 시
`build_document` 가 `template_profile "gongmun_v1" does not match` 에러 내면:
1. 올바른 `공문서_프레임.hwpx` 를 열었는지 재확인
2. 파일이 손상/수정됐다면 `<TEMPLATE_DIR>` 에서 재복사
3. 최후 폴백: Mode C 로 전환 + 사용자에게 "서식 검증 실패로 자유형 생성" 안내

---

## 상세 참조 로드 규칙 (중요)

아래 경우 **반드시 먼저** `Read` 도구로 `REFERENCE.md` 를 읽을 것 — 생략하면 정확한 서식·placeholder 가 빠져 품질 저하:

- Mode A 진행 시 → **placeholder 맵 전체** 로드
- Mode B 진행 시 → **preset 카탈로그 + build_document 예시** 로드
- Mode C 에서 DGIST 표준 계층·표 폭·폰트를 정확히 쓸 때 → **계층별 수치 표** 로드
- `set_hanging_indent` 호출 시 → **firstLineIndent 수치** 로드

참조 없이 대충 수치 쓰지 말 것 — 토큰 절감보다 품질이 우선.

---

## 참고

- MCP 도구: 135 (v0.5.2 에서 `get_user_paths` 추가)
- 템플릿 버전: 2026-04-24 기준
- 프로필 등록: `mcp-server/src/TemplateProfiles.ts`
- 경로 헬퍼: `mcp-server/src/UserPaths.ts`
- GitHub: https://github.com/flamingo8006/hwpx-mcp
