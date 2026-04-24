# HWPX MCP Server

[![npm](https://img.shields.io/npm/v/hwpx-mcp-server)](https://www.npmjs.com/package/hwpx-mcp-server)

AI 도구(Claude, Cursor 등)와 연동하여 한글(HWPX) 문서를 자동으로 편집할 수 있는 MCP(Model Context Protocol) 서버입니다. **132개 도구**를 제공합니다.

---

## Cross-Platform Support

| OS | MCP 서버 | HWPX 편집 | 결과물 확인 |
|:---:|:---:|:---:|:---|
| Windows | O | O | 한컴오피스 |
| macOS | O | O | 한컴오피스 Mac |
| Linux | O | O | 한컴오피스 Linux / LibreOffice* |

> HWPX 파일은 **ZIP + XML 구조**이므로 한글 프로그램 없이도 Node.js만으로 읽고 쓸 수 있습니다.
> *LibreOffice는 HWPX를 제한적으로 지원합니다.

---

## 1. 설정

별도 설치 없이 MCP 클라이언트 설정만 추가하면 됩니다. (Node.js 18+ 필요)

### Claude Desktop

**설정 파일 위치:**

| OS | 경로 |
|----|------|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**설정 내용:**
```json
{
  "mcpServers": {
    "hwpx": {
      "command": "npx",
      "args": ["-y", "hwpx-mcp-server@latest"]
    }
  }
}
```

---

### Claude Code (CLI)

**macOS / Linux:**
```bash
# 전역 설정 (모든 프로젝트에서 사용)
claude mcp add hwpx --scope user npx -y hwpx-mcp-server@latest

# 프로젝트별 설정
claude mcp add hwpx npx -y hwpx-mcp-server@latest
```

**Windows:**
```bash
# 전역 설정
claude mcp add hwpx --scope user -- npx -y hwpx-mcp-server@latest

# 프로젝트별 설정
claude mcp add hwpx -- npx -y hwpx-mcp-server@latest
```

> Windows에서는 `--`를 넣어야 `-y` 옵션이 정상 전달됩니다.

---

### Cursor

**설정 파일:** `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "hwpx": {
      "command": "npx",
      "args": ["-y", "hwpx-mcp-server@latest"]
    }
  }
}
```

---

### VS Code

**설정 파일:** `.vscode/mcp.json`

```json
{
  "servers": {
    "hwpx": {
      "command": "npx",
      "args": ["-y", "hwpx-mcp-server@latest"]
    }
  }
}
```

---

### Codex / Gemini CLI / 기타

```json
{
  "mcpServers": {
    "hwpx": {
      "command": "npx",
      "args": ["-y", "hwpx-mcp-server@latest"]
    }
  }
}
```

---

## 2. 문서 작성 스킬 설치 (선택)

스킬 파일을 설치하면 AI가 `build_document` 도구를 활용하여 서식이 갖춰진 한글 문서를 **한 번의 호출로** 작성합니다.

스킬 파일 URL:
`https://raw.githubusercontent.com/flamingo8006/hwpx-mcp/main/skills/hwpx-document-writer.md`

### Claude Code

**macOS / Linux:**
```bash
mkdir -p ~/.claude/skills/hwpx-document-writer
curl -o ~/.claude/skills/hwpx-document-writer/skill.md \
  https://raw.githubusercontent.com/flamingo8006/hwpx-mcp/main/skills/hwpx-document-writer.md
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills\hwpx-document-writer"
curl.exe -o "$HOME\.claude\skills\hwpx-document-writer\skill.md" `
  https://raw.githubusercontent.com/flamingo8006/hwpx-mcp/main/skills/hwpx-document-writer.md
```

### Claude Desktop

Claude Desktop은 공식적으로 커스텀 스킬을 지원하지 않습니다. **프로젝트 Custom Instructions** 사용을 권장합니다:

1. 위 URL에서 스킬 파일 내용을 복사
2. Claude Desktop에서 **프로젝트 생성**
3. 프로젝트 설정 → **Custom Instructions** 에 붙여넣기

### 기타 클라이언트 (Cursor / Codex / Gemini CLI)

위 URL에서 스킬 파일 내용을 복사하여 시스템 프롬프트에 포함시키면 동일한 효과를 얻을 수 있습니다.

---

## 3. 설치 확인

클라이언트 재시작 후 MCP 도구 목록에서 `hwpx` 서버와 132개 도구가 표시되면 성공입니다.

---

## 4. MCP 도구 목록 (132개)

### 문서 관리 (8개)

| 도구 | 설명 |
|------|------|
| `get_tool_guide` | 도구 사용 가이드 조회 |
| `create_document` | 새 빈 HWPX 문서 생성 |
| `open_document` | HWPX 문서 열기 |
| `close_document` | 열린 문서 닫기 |
| `save_document` | 문서 저장 (백업/무결성 검증 지원) |
| `list_open_documents` | 현재 열린 문서 목록 |
| `get_document_metadata` | 메타데이터 조회 (제목, 저자, 날짜) |
| `set_document_metadata` | 메타데이터 수정 |

### 문서 조회 (9개)

| 도구 | 설명 |
|------|------|
| `get_document_text` | 전체 텍스트 추출 |
| `get_document_structure` | 문서 구조 (섹션/단락/테이블/이미지 수) |
| `get_document_outline` | 문서 개요 (제목 기반) |
| `get_paragraphs` | 단락 목록 조회 |
| `get_paragraph` | 특정 단락 상세 정보 |
| `get_word_count` | 글자수/단어수 통계 |
| `get_insert_context` | 삽입 위치 컨텍스트 조회 |
| `find_insert_position_after_header` | 제목 다음 삽입 위치 찾기 |
| `find_insert_position_after_table` | 테이블 다음 삽입 위치 찾기 |

### 텍스트 편집 (11개)

| 도구 | 설명 |
|------|------|
| `insert_paragraph` | 새 단락 삽입 |
| `update_paragraph_text` | 단락 텍스트 수정 (전체 교체) |
| `update_paragraph_text_preserve_styles` | 스타일 유지하며 텍스트 수정 |
| `append_text_to_paragraph` | 기존 단락에 텍스트 추가 |
| `delete_paragraph` | 단락 삭제 |
| `copy_paragraph` | 단락 복사 |
| `move_paragraph` | 단락 이동 |
| `format_text` | 텍스트 포매팅 |
| `search_text` | 텍스트 검색 (정규식, 테이블 셀 포함) |
| `replace_text` | 텍스트 찾아 바꾸기 |
| `find_paragraph_by_text` | 텍스트로 단락 찾기 |

### 일괄 처리 (2개)

| 도구 | 설명 |
|------|------|
| `batch_replace` | 여러 텍스트 일괄 치환 |
| `batch_fill_table` | 테이블 여러 셀 일괄 채우기 |

### 서식 - 문자/문단 스타일 (10개)

| 도구 | 설명 |
|------|------|
| `get_text_style` | 문자 스타일 조회 (폰트/크기/색상) |
| `set_text_style` | 문자 스타일 설정 |
| `get_paragraph_style` | 문단 스타일 조회 (정렬/줄간격/여백) |
| `set_paragraph_style` | 문단 스타일 설정 |
| `get_styles` | 문서 스타일 목록 |
| `get_char_shapes` | 문자 모양(CharShape) 정의 |
| `get_para_shapes` | 문단 모양(ParaShape) 정의 |
| `apply_style` | 단락에 스타일 적용 |
| `get_column_def` | 단(Column) 설정 조회 |
| `set_column_def` | 단 설정 변경 (다단 편집) |

### 번호/불릿 매기기 (3개)

| 도구 | 설명 |
|------|------|
| `get_numbering_defs` | 번호 매기기 정의 목록 |
| `get_bullet_defs` | 불릿 정의 목록 |
| `set_numbering` | 번호/불릿 목록 스타일 적용 |

### 내어쓰기 (8개)

| 도구 | 설명 |
|------|------|
| `get_hanging_indent` | 내어쓰기 조회 |
| `set_hanging_indent` | 내어쓰기 설정 |
| `set_auto_hanging_indent` | 자동 내어쓰기 |
| `remove_hanging_indent` | 내어쓰기 제거 |
| `get_table_cell_hanging_indent` | 셀 내어쓰기 조회 |
| `set_table_cell_hanging_indent` | 셀 내어쓰기 설정 |
| `set_table_cell_auto_hanging_indent` | 셀 자동 내어쓰기 |
| `remove_table_cell_hanging_indent` | 셀 내어쓰기 제거 |

### 테이블 (29개)

| 도구 | 설명 |
|------|------|
| `get_tables` | 테이블 목록 |
| `get_table` | 테이블 상세 데이터 |
| `get_table_cell` | 특정 셀 내용 |
| `get_table_as_csv` | 테이블을 CSV로 추출 |
| `get_table_map` | 테이블 구조 맵 |
| `get_tables_summary` | 테이블 요약 정보 |
| `get_tables_by_section` | 섹션별 테이블 |
| `get_cell_context` | 셀 컨텍스트 정보 |
| `find_table_by_header` | 헤더로 테이블 찾기 |
| `find_cell_by_label` | 라벨로 셀 찾기 |
| `find_empty_tables` | 빈 테이블 찾기 |
| `get_element_index_for_table` | 테이블 요소 인덱스 |
| `fill_by_path` | 경로 기반 셀 채우기 |
| `insert_table` | 테이블 삽입 |
| `insert_nested_table` | 중첩 테이블 삽입 (표 안에 표) |
| `delete_table` | 테이블 삭제 |
| `update_table_cell` | 셀 수정 |
| `replace_text_in_cell` | 셀 내 텍스트 치환 |
| `set_cell_properties` | 셀 속성 설정 (크기/배경/정렬) |
| `set_cell_background_color` | 셀 배경색 설정 |
| `set_column_widths` | 열 너비 설정 |
| `insert_table_row` | 행 추가 |
| `delete_table_row` | 행 삭제 |
| `insert_table_column` | 열 추가 |
| `delete_table_column` | 열 삭제 |
| `merge_cells` | 셀 병합 |
| `split_cell` | 셀 분할 |
| `copy_table` | 테이블 복사 |
| `move_table` | 테이블 이동 |

### 이미지 (7개)

| 도구 | 설명 |
|------|------|
| `get_images` | 이미지 목록 |
| `insert_image` | 이미지 삽입 |
| `insert_image_in_cell` | 테이블 셀에 이미지 삽입 |
| `update_image_size` | 이미지 크기 변경 |
| `delete_image` | 이미지 삭제 |
| `render_mermaid` | Mermaid 다이어그램 삽입 |
| `render_mermaid_in_cell` | 셀에 Mermaid 다이어그램 삽입 |

### 도형 (3개)

| 도구 | 설명 |
|------|------|
| `insert_line` | 선 도형 삽입 |
| `insert_rect` | 사각형 도형 삽입 |
| `insert_ellipse` | 타원 도형 삽입 |

### 머리글/바닥글 (4개)

| 도구 | 설명 |
|------|------|
| `get_header` | 머리글 조회 |
| `set_header` | 머리글 설정 |
| `get_footer` | 바닥글 조회 |
| `set_footer` | 바닥글 설정 |

### 각주/미주 (4개)

| 도구 | 설명 |
|------|------|
| `get_footnotes` | 각주 목록 |
| `insert_footnote` | 각주 삽입 |
| `get_endnotes` | 미주 목록 |
| `insert_endnote` | 미주 삽입 |

### 북마크/하이퍼링크 (4개)

| 도구 | 설명 |
|------|------|
| `get_bookmarks` | 북마크 목록 |
| `insert_bookmark` | 북마크 삽입 |
| `get_hyperlinks` | 하이퍼링크 목록 |
| `insert_hyperlink` | 하이퍼링크 삽입 |

### 수식/메모 (5개)

| 도구 | 설명 |
|------|------|
| `get_equations` | 수식 목록 |
| `insert_equation` | 수식 삽입 |
| `get_memos` | 메모 목록 |
| `insert_memo` | 메모 삽입 |
| `delete_memo` | 메모 삭제 |

### 섹션/페이지 (6개)

| 도구 | 설명 |
|------|------|
| `get_sections` | 섹션 목록 |
| `insert_section` | 섹션 삽입 |
| `delete_section` | 섹션 삭제 |
| `get_page_settings` | 페이지 설정 조회 |
| `set_page_settings` | 페이지 설정 변경 |
| `insert_page_break` | 페이지 나누기 삽입 |

### 내보내기 (2개)

| 도구 | 설명 |
|------|------|
| `export_to_text` | 텍스트 파일로 내보내기 |
| `export_to_html` | HTML 파일로 내보내기 |

### 실행 취소 (2개)

| 도구 | 설명 |
|------|------|
| `undo` | 실행 취소 |
| `redo` | 다시 실행 |

### 검색/인덱싱 (8개)

| 도구 | 설명 |
|------|------|
| `chunk_document` | 문서 청킹 |
| `search_chunks` | 청크 검색 |
| `get_chunk_context` | 청크 컨텍스트 |
| `get_chunk_at_offset` | 오프셋 청크 조회 |
| `extract_toc` | 목차 추출 |
| `build_position_index` | 위치 인덱스 빌드 |
| `get_position_index` | 위치 인덱스 조회 |
| `search_position_index` | 위치 인덱스 검색 |

### 고급/디버깅 (7개)

| 도구 | 설명 |
|------|------|
| `get_section_xml` | 섹션 XML 조회 |
| `set_section_xml` | 섹션 XML 설정 |
| `get_raw_section_xml` | 원본 섹션 XML 조회 |
| `set_raw_section_xml` | 원본 섹션 XML 설정 |
| `analyze_xml` | XML 구조 분석 |
| `repair_xml` | XML 복구 |
| `invalidate_reading_cache` | 읽기 캐시 무효화 |

---

## 5. 사용 예시

### 예시 1: 기본 문서 편집

```
사용자: report.hwpx 열어서 3번째 단락 텍스트를 수정해줘

AI 동작:
1. open_document("report.hwpx")
2. get_paragraphs(section_index=0) → 단락 목록 확인
3. update_paragraph_text(section=0, paragraph=2, text="수정된 내용")
4. save_document()
```

### 예시 2: 테이블 셀 수정

```
사용자: 사업계획서.hwpx에서 3번째 테이블의 2행 1열을 수정해줘

AI 동작:
1. open_document("사업계획서.hwpx")
2. get_tables() → 테이블 목록 확인
3. get_table(section=0, index=2) → 구조 확인
4. update_table_cell(section=0, table=2, row=1, col=0, text="수정 내용")
5. save_document()
```

### 예시 3: 스타일 복사 후 새 단락 추가

```
사용자: 기존 양식의 스타일을 참고해서 새 문단을 추가해줘

AI 동작:
1. get_paragraph_style(sec=0, para=10) → {align: "Justify", lineSpacing: 145}
2. get_text_style(sec=0, para=10) → {fontName: "맑은 고딕", fontSize: 14}
3. insert_paragraph(sec=0, after=10, text="새 내용")
4. set_paragraph_style(sec=0, para=11, align="justify", line_spacing=145)
5. set_text_style(sec=0, para=11, font_name="맑은 고딕", font_size=14)
6. save_document()
```

### 예시 4: 테이블 셀 검색 후 정밀 치환

```
사용자: "김철수"를 "이영희"로 바꿔줘 (3번째 테이블의 것만)

AI 동작:
1. search_text(query="김철수", include_tables=true)
   → [{type: "table", tableIndex: 2, row: 3, col: 1}, ...]
2. replace_text_in_cell(table=2, row=3, col=1, old="김철수", new="이영희")
3. save_document()
```

### 예시 5: Mermaid 다이어그램 삽입

```
사용자: 플로우차트를 문서에 넣어줘

AI 동작:
1. render_mermaid(
     mermaid_code="graph TD; A[시작]-->B[처리]; B-->C[완료]",
     after_index=5,
     theme="default"
   )
2. save_document()
```

### 예시 6: 일괄 치환

```
사용자: "2025년"을 "2026년"으로, "홍길동"을 "김영수"로 전부 바꿔줘

AI 동작:
1. batch_replace(replacements=[
     {old_text: "2025년", new_text: "2026년"},
     {old_text: "홍길동", new_text: "김영수"}
   ])
2. save_document()
```

---

## 6. 지원 포맷

| 포맷 | 확장자 | 읽기 | 쓰기 |
|------|--------|:----:|:----:|
| HWPX | .hwpx | O | O |
| HWP | .hwp | X | X |

> HWP(바이너리) 파일은 지원하지 않습니다. 한컴오피스에서 HWPX로 변환 후 사용하세요.

---

## 7. 알려진 제한사항

- **각주/미주/북마크/하이퍼링크 삽입**: 메모리에서만 동작, save 후 XML 미반영 (읽기는 정상)
- **HWP 파일**: 지원하지 않음 (HWPX로 변환 필요)
- **secPr 문단 스타일**: 첫 번째 특수 문단에서 스타일 reload 제한

---

## 8. 개발

### 빌드

```bash
cd mcp-server
npm run build
```

### 테스트

```bash
cd mcp-server
npm test                          # 전체 테스트 (vitest)
npx vitest run src/HwpxDocument.test.ts  # 특정 파일
npx vitest run -t "test name"     # 이름 패턴
```

---

## Credits

- Original Project: [mjyoo2/hwp-extension](https://github.com/mjyoo2/hwp-extension)
- Enhanced by: [Dayoooun](https://github.com/Dayoooun)

## License

MIT
