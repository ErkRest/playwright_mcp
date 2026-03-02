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

- `browser.newSession`
- `browser.navigate`
- `browser.screenshot`
- `browser.closeSession`

## Additional Tools

- `browser.click`
- `browser.fill`
- `dom.queryText`
- `browser.evaluate`
- `browser.waitFor`
- `browser.press`

## 快速開始

```bash
npm install
npx playwright install chromium
npm run dev
```

預設啟動位址：`http://localhost:3000/mcp`

## 測試範例

- VS Code REST Client：`examples/mcp.http`
	- 依序執行 `initialize` → `tools/list` → `browser.newSession`
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

## 安全預設

- 僅允許 `http/https`
- 預設封鎖 `localhost`、`127.0.0.1`
- 可透過 `ALLOWED_HOSTS` 啟用 allowlist
