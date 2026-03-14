# 量化交易訊號判別工具 (多頭策略版) 實作計畫

本專案將開發一個基於 Node.js 的輕量級工具，協助使用者判別台指期與比特幣的做多訊號。系統將整合 K 線資料抓取、技術指標計算與策略邏輯判斷。

## 使用者評論與確認事項

> [!IMPORTANT]
> **開發與 Git 規則**：
> - **Git 儲存庫**：`https://github.com/sa885450/Long.git`
> - **Git 執行路徑**：`C:\Program Files\Git\bin\git.exe`
> - **UI 部署**：產生出的 UI 介面需上傳到 Git，路徑指定為 `public/index.html`。
> - **資料庫選擇**：後端若需用到資料庫，一律使用 **SQLite**。
> - **執行觸發**：僅在使用者說「請執行」時，才開始進行程式碼異動。
> - **完成流程**：每次異動後，須在 `README.md` 加入版本更新日誌，同步 `package.json` 的版本號，最後執行 `git push`。
> - **資料來源確認**：
> - **台指期**：台指期即時資料 API 較少，計畫優先嘗試使用 Yahoo Finance API (`^TWII` 或相關期貨代碼) 或擬合資料來源。若使用者有特定 API 金鑰 (例如：群益、凱基)，請告知以進行對接。

---

## 擬議變更

### 1. 系統架構

採用 **Node.js (Backend)** + **Vite (Frontend)** 的分離架構，確保開發效率與介面美觀。

- **後端 (Backend)**: 使用 Express 提供 API。
- **資料庫 (DB)**: 使用 **SQLite** (如有需要存放歷史資料或使用者配置)。
- **指標計算**: 使用 `technicalindicators` 函式庫計算 SMA 與 MACD。
- **前端 (Frontend)**: 使用 Vanilla JS + 高階 CSS (Glassmorphism)，建立 Premium 感的 UI。

### 2. 元件開發

#### [NEW] 後端模組 (`src/backend`)
- `data-fetcher.js`: 負責從 Binance/Yahoo Finance 抓取 OHLCV 資料。
- `strategy-engine.js`: 計算指標並執行「做多」策略邏輯判斷。
- `server.js`: API 進入點。

#### [NEW] 前端模組 (`src/frontend`)
- `index.html`: 結構化 UI。
- `main.css`: 實作磨砂玻璃效果 (Glassmorphism) 與動態動畫。
- `app.js`: 處理使用者參數、呼叫後端 API 並渲染結果。

### 3. 核心策略邏輯 (做多)

系統將嚴格遵循以下條件進行判定：
1. **價格 > SMA60**。
2. **SMA10 > SMA60** 且 **SMA10 趨勢向上**。
3. **MACD 快線 > 慢線** 且 **MACD 快線趨勢向上**。

---

## 驗證計畫

### 自動化測試
- 建立單元測試驗證 `strategy-engine.js` 在給定模擬資料下，計算出的指標是否與 TradingView 等工具一致。

### 手動驗證
1. **介面測試**：切換不同商品 (台指期/BTC) 與週期 (5m/1H/Day)，確認資料能正確載入。
2. **邏輯比對**：手動比對輸出結果中的 SMA10/60 趨勢、MACD 狀態是否符合預期。
3. **視覺效果**：確保「符合」與「不符合」的視覺呈現具有高度區別性。
