# HWPX MCP Server (Standalone)

HWP/HWPX 문서를 AI로 읽고 편집할 수 있는 Model Context Protocol (MCP) 서버입니다.

## 특징

- **132개 도구**: 문서의 모든 요소를 프로그래밍 방식으로 제어
- **HWPX 완전 편집**: 텍스트, 테이블, 이미지, 스타일, 머리글/꼬리글, 번호매기기 등
- **XML 무결성 보장**: 모든 편집이 HWPML 규격에 맞게 XML에 저장
- **E2E 테스트 통과**: save-reload 검증 완료

## 설치

```bash
cd mcp-server
npm install
npm run build
```

## 설정

상세 설정 가이드는 [루트 README](../README.md)를 참고하세요.

### 빠른 설정

**Claude Code:**
```bash
claude mcp add hwpx node /path/to/hwpx-mcp/mcp-server/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "hwpx": {
      "command": "node",
      "args": ["/path/to/hwpx-mcp/mcp-server/dist/index.js"]
    }
  }
}
```

## 테스트

```bash
npm test                    # vitest 단위 테스트
npm run test:watch          # watch 모드
```

## 도구 목록 (132개)

전체 목록은 [루트 README](../README.md#4-mcp-도구-목록-132개)를 참고하세요.

**카테고리 요약:**

| 카테고리 | 도구 수 | 주요 도구 |
|----------|---------|-----------|
| 문서 관리 | 8 | `open_document`, `save_document`, `create_document` |
| 문서 조회 | 9 | `get_paragraphs`, `get_document_text`, `get_document_outline` |
| 텍스트 편집 | 11 | `insert_paragraph`, `update_paragraph_text`, `search_text` |
| 일괄 처리 | 2 | `batch_replace`, `batch_fill_table` |
| 서식/스타일 | 10 | `set_text_style`, `set_paragraph_style`, `apply_style` |
| 번호/불릿 | 3 | `set_numbering`, `get_numbering_defs`, `get_bullet_defs` |
| 내어쓰기 | 8 | `set_hanging_indent`, `set_auto_hanging_indent` |
| 테이블 | 29 | `get_table`, `update_table_cell`, `merge_cells`, `fill_by_path` |
| 이미지 | 7 | `insert_image`, `insert_image_in_cell`, `render_mermaid` |
| 도형 | 3 | `insert_line`, `insert_rect`, `insert_ellipse` |
| 머리글/바닥글 | 4 | `set_header`, `set_footer` |
| 각주/미주 | 4 | `insert_footnote`, `insert_endnote` |
| 북마크/링크 | 4 | `insert_bookmark`, `insert_hyperlink` |
| 수식/메모 | 5 | `insert_equation`, `insert_memo` |
| 섹션/페이지 | 6 | `insert_section`, `set_page_settings`, `insert_page_break` |
| 내보내기 | 2 | `export_to_text`, `export_to_html` |
| 실행 취소 | 2 | `undo`, `redo` |
| 검색/인덱싱 | 8 | `chunk_document`, `search_chunks`, `extract_toc` |
| 고급/디버깅 | 7 | `get_section_xml`, `set_section_xml`, `repair_xml` |

## 알려진 제한사항

- **각주/미주/북마크/하이퍼링크 삽입**: 메모리에서만 동작, save 후 XML 미반영 (읽기는 정상)
- **HWP 파일**: 지원하지 않음 (HWPX로 변환 필요)

## 라이선스

MIT
