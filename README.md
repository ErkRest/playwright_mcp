# Playwright MCP Server (Koa + TypeScript)

這是一個以 **Koa + TypeScript + Playwright** 實作的 MCP server 範本，提供最小可用的瀏覽器工具組。

## 架構

- `src/transport/`：HTTP 傳輸層（`POST /mcp`，JSON-RPC 封包處理）
- `src/mcp/`：MCP method dispatcher（`initialize`、`tools/list`、`tools/call`）
- `src/mcp/tools/`：工具註冊與輸入驗證（Zod）
- `src/playwright/`：Playwright browser/context/page 生命週期管理
- `src/domain/sessions/`：session metadata 與 TTL 清理
- `src/shared/`：logger / error model
- `src/config/`：環境設定

## MVP Tools

- `browser_new_session`
- `browser_navigate`
- `browser_screenshot`
- `browser_close_session`

## Additional Tools

- `browser_click`
- `browser_fill`
- `dom_query_text`
- `browser_evaluate`
- `browser_wait_for`
- `browser_press`
- `frame_query_text`
- `frame_click`

### `browser_navigate` 參數

- `sessionId`：必填
- `url`：必填
- `waitUntil`：可選，支援 `domcontentloaded | load | networkidle | commit`
- `timeoutMs`：可選，預設 `30000`

## 快速開始

```bash
npm install
npx playwright install chromium
npm run dev
```

預設啟動位址：`http://localhost:3000/mcp`

## VS Code MCP（stdio 代理轉發）

若你的 VS Code MCP 客戶端只支援 `stdio`，可使用本專案內建代理：

1. 啟動 HTTP MCP server
	```bash
	npm run dev
	```
2. 另開一個 terminal 啟動 stdio 代理
	```bash
	npm run proxy:dev
	```
3. VS Code 讀取 `.vscode/mcp.json`（已提供範本）後，即可透過 stdio 使用工具。

代理設定檔：`/.vscode/mcp.json`

- `MCP_HTTP_URL` 預設 `http://localhost:3000/mcp`
- `MCP_PROXY_TIMEOUT_MS` 預設 `30000`

## 測試範例

- VS Code REST Client：`examples/mcp.http`
	- 依序執行 `initialize` → `tools/list` → `browser_new_session`
	- 把回傳的 `sessionId` 填到 `@sessionId`，再執行 navigate/screenshot/close
- PowerShell smoke test：`examples/smoke-test.ps1`
	- 先啟動 server（`npm run dev`）
	- 另一個 terminal 執行：`./examples/smoke-test.ps1`
	- 成功後會在 `examples/` 產生 `smoke-shot.png`
	- 或直接執行：`npm run smoke`

## 環境變數

- `PORT`：服務埠號（預設 `3000`）
- `PLAYWRIGHT_HEADLESS`：`false` 可開啟有頭模式（預設 headless）
- `ALLOWED_HOSTS`：允許的網域清單（逗號分隔，例如 `example.com,docs.example.com`）
- `SESSION_TTL_MS`：閒置 session 清理時間（預設 15 分鐘）

可參考 `/.env.example` 建立你自己的設定。

PowerShell 臨時設定範例：

```powershell
$env:PLAYWRIGHT_HEADLESS="false"
npm run dev
```

## 安全預設

- 僅允許 `http/https`
- 預設封鎖 `localhost`、`127.0.0.1`
- 可透過 `ALLOWED_HOSTS` 啟用 allowlist
