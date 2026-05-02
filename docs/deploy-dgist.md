# [DEPRECATED] HWPX MCP — DGIST 배포 가이드

> **이 문서는 더 이상 유지되지 않습니다.**
>
> DGIST 운영 배포 표준이 `ask.dgist.ac.kr/mcp` (AskON path) 에서 `mcp.dgist.ac.kr/hwpx` (외부 MCP 게이트웨이 도메인) 로 이전되면서, 본 가이드의 도메인·architecture·보안 모델이 모두 갱신되었습니다.
>
> 최신 가이드: **[`docs/deploy-mcp-platform.md`](./deploy-mcp-platform.md)**
>
> 변경 요약:
> - 도메인: `ask.dgist.ac.kr/mcp` → `mcp.dgist.ac.kr/hwpx`
> - 디렉토리: 임의 위치 → 학내 표준 `/app/mcp/hwpx` + `/data/mcp/hwpx/logs`
> - nginx: 별도 `.conf` 파일 → `/etc/nginx/sites-available/dgist-ai` 단일 파일에 server block 누적
> - 다중 MCP 패턴: 단일 path 가정 → 단일 도메인 + path 분기 (`/<svc>` 누적)
> - 멀티 테넌시: 명시 격리 없음 → `docOwners` Map + per-owner cap (`MCP_MAX_OPEN_DOCS_PER_OWNER`)
> - 내부 전용 MCP 트랙 분리 (별도 도메인 `mcp-internal.dgist.ac.kr` — 본 가이드 범위 밖)
>
> 본 파일은 git history 보존 목적으로만 남겨두며, 다음 npm publish 시점에 삭제 예정입니다.
