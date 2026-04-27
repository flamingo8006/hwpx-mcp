# hwpx-mcp 설치 패키지

Claude Desktop 에서 한글(HWPX) 문서를 자동 작성할 수 있도록 MCP 서버·스킬·공문서 서식 템플릿을 한 번에 설치합니다.

## 설치되는 것

| 항목 | 위치 (Windows) | 위치 (macOS) |
|------|----------------|---------------|
| Claude Desktop MCP 등록 | `claude_desktop_config.json` 의 `mcpServers.hwpx` | 동일 (`~/Library/Application Support/Claude/`) |
| 한글 작성 스킬 | `%USERPROFILE%\.claude\skills\hwpx-document-writer\` | `~/.claude/skills/hwpx-document-writer/` |
| 공문서 서식 템플릿 | `%USERPROFILE%\Documents\skills\templates\공문서_프레임.hwpx` | `~/Documents/skills/templates/공문서_프레임.hwpx` |

기존에 설치되어 있는 경우에도 안전합니다:
- **다른 MCP 설정**(Obsidian, Gmail 등)은 절대 건드리지 않습니다.
- **다른 스킬 폴더**도 보존됩니다.
- **기존 hwpx 관련 파일**은 `.bak-{날짜시각}` 으로 백업 후 교체되며, 백업은 최근 2개만 유지됩니다.

---

## 사전 요구사항

1. **[Node.js 18 LTS](https://nodejs.org/) 이상** 설치 — 터미널/PowerShell 에서 `node --version` 이 떠야 합니다.
2. **[Claude Desktop](https://claude.ai/download)** 설치 — 설치 직후 **최소 한 번은 실행** 해서 설정 파일이 생성되게 해주세요.

---

## Windows 설치 (추천)

1. 배포받은 `hwpx-mcp-installer-windows.zip` 을 다운로드 받은 폴더에서 **압축 해제** 합니다.
2. 압축 푼 폴더 안의 **`install-windows.bat`** 파일을 **더블클릭** 합니다.
3. Windows SmartScreen 경고가 뜨면 **「추가 정보」 → 「실행」** 을 눌러 진행합니다.
4. PowerShell 창에 설치 계획이 표시되고, 자동으로 설정이 완료됩니다.
5. 설치가 끝나면 **Claude Desktop 을 완전히 종료한 뒤 다시 실행** 합니다.
   - 시스템 트레이(화면 우하단) 아이콘을 우클릭 → **Quit**.
   - 일반 창 닫기(X)만 하면 백그라운드에 남아 설정이 안 반영됩니다.

### 표준 사용자 계정 (관리자 권한 없는 PC)

Microsoft Store 버전 Claude Desktop 이 설치된 경우에도 설치 스크립트가 자동으로 경로를 찾아갑니다:
- 일반(EXE installer): `%APPDATA%\Claude\claude_desktop_config.json`
- Store 앱: `%LOCALAPPDATA%\Packages\Claude_{publisherHash}\LocalCache\Roaming\Claude\claude_desktop_config.json`

수동으로 경로를 지정하고 싶으면 PowerShell 에서:
```powershell
$env:HWPX_MCP_CLAUDE_CONFIG = "C:\전체\경로\claude_desktop_config.json"
.\install-windows.ps1
```

---

## macOS 설치 (수동 가이드)

배치파일 없이 3단계로 수동 설치합니다.

### 1) MCP 등록

`~/Library/Application Support/Claude/claude_desktop_config.json` 파일을 엽니다. 없으면 새로 만듭니다.

**파일이 없거나 비어있을 때:**
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

**이미 다른 MCP 가 등록되어 있을 때** — `mcpServers` 객체 안에 `hwpx` 키만 추가:
```json
{
  "mcpServers": {
    "obsidian": { "...": "..." },
    "hwpx": {
      "command": "npx",
      "args": ["-y", "hwpx-mcp-server@latest"]
    }
  }
}
```

### 2) 스킬 설치

터미널에서:
```bash
mkdir -p ~/.claude/skills
unzip -o payload/hwpx-document-writer.zip -d ~/.claude/skills/
```

### 3) 템플릿 복사

```bash
mkdir -p ~/Documents/skills/templates
cp payload/공문서_프레임.hwpx ~/Documents/skills/templates/
```

### 4) Claude Desktop 재시작

Cmd+Q 로 완전 종료 → 다시 실행.

---

## 설치 확인

Claude Desktop 의 새 대화에서 아래 프롬프트로 테스트:

```
공문서 서식으로 '설치 테스트' 라는 간단한 문서 하나 만들어줘
```

정상 동작하면 `~/Downloads/` (macOS) / `%USERPROFILE%\Downloads\` (Windows) 에 `.hwpx` 파일이 생성됩니다.

---

## 샘플 프롬프트

| 원하는 작업 | 예시 프롬프트 |
|-------------|--------------|
| 공문서 서식으로 보고서 | "공문서 서식으로 2026년 생성형 AI 교육 계획 작성해줘" |
| 일반 한글 문서 (자유 양식) | "한글 문서로 회의록 작성해줘 (일시·참석자·안건·결정사항 포함)" |
| 기존 hwpx 파일 수정 | "~/Downloads/보고서.hwpx 열어서 제목을 'v2' 로 바꿔줘" |

---

## 제거

**Windows**: 설치 폴더의 `uninstall-windows.bat` 더블클릭.

**macOS (수동)**:
```bash
# 1) Claude Desktop config 에서 hwpx 항목만 제거 — JSON 수동 편집
# 2) 스킬 폴더 백업 후 제거
mv ~/.claude/skills/hwpx-document-writer \
   ~/.claude/skills/hwpx-document-writer.bak-$(date +%Y%m%d-%H%M%S)
# 3) 템플릿은 사용자가 편집했을 수 있어 자동 삭제 안 함 — 필요 시 수동으로:
#    rm ~/Documents/skills/templates/공문서_프레임.hwpx
```

Claude Desktop 재시작하면 hwpx 연동이 제거됩니다.

---

## 문제 해결

### "Node.js not found"
→ https://nodejs.org/ 에서 **LTS 버전** 설치 후 재시도. 설치 후 터미널/PowerShell 을 완전히 새로 열어야 PATH 가 반영됩니다.

### "Claude Desktop config directory not found"
→ Claude Desktop 설치 후 **한 번도 실행하지 않은 상태**. Claude Desktop 을 열어 로그인까지 완료한 뒤 재시도.

비표준 경로에 설치된 경우 환경변수로 강제 지정:
```powershell
# Windows
$env:HWPX_MCP_CLAUDE_CONFIG = "C:\Users\내계정\AppData\Roaming\Claude\claude_desktop_config.json"
.\install-windows.ps1
```
```bash
# macOS
HWPX_MCP_CLAUDE_CONFIG="/Users/내계정/..." bash install-macos.sh  # (현재는 수동 가이드만 제공)
```

### "Multiple Claude config files detected"
→ EXE installer 버전과 Store 버전이 같이 설치된 경우. 메시지에 나온 경로 중 **실제로 쓰는 것** 을 환경변수로 지정한 뒤 재설치.

### 설치 후에도 "한글 MCP 도구가 없다" 고 나옴
→ Claude Desktop 을 **완전히 종료** 후 재실행. 트레이 아이콘 우클릭 → Quit. 창 닫기(X)만 하면 반영 안 됩니다.

### 템플릿이 깨졌다 / 잘못 설치됐다
→ 같은 installer 를 다시 실행하세요. 기존 파일은 `.bak-{timestamp}` 로 백업된 후 교체됩니다.

### 완전히 롤백하고 싶다
1. `uninstall-windows.bat` 실행.
2. `claude_desktop_config.json.bak-{timestamp}` 중 설치 **이전** 타임스탬프 파일을 원래 이름으로 복원.
3. `hwpx-document-writer.bak-{timestamp}` 폴더도 마찬가지로 복원.
4. Claude Desktop 재시작.

---

## 관련 링크

- npm 패키지: <https://www.npmjs.com/package/hwpx-mcp-server>
- GitHub: <https://github.com/flamingo8006/hwpx-mcp>
- 이슈/문의: GitHub Issues

---

## 라이선스 / 배포

DGIST 정보전산팀 테스터 배포판. 라이선스는 저장소 루트의 `LICENSE` 파일을 따릅니다.
