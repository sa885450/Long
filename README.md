# 量化交易訊號判別工具 (Long)

這是一個輕量級的交易訊號輔助工具，專門針對「做多」策略進行指標判別。

## 功能特點
- 支持比特幣 (Binance) 與台指期 (Yahoo Finance)。
- 自動計算 SMA10, SMA60 與 MACD。
- 直觀的策略判斷結果 (符合/不符合)。
- 現代化 Glassmorphism UI 介面。

## 快速開始
1. 安裝相依套件：
   ```bash
   npm install
   ```
2. 啟動伺服器：
   ```bash
   node src/backend/server.js
   ```
3. 開啟瀏覽器訪問 `http://localhost:3000`。

---

## 版本更新日誌

### [1.1.0] - 2026-03-14
- **雲端化部署支援**
- 串接 Render.com 後端 API 網址。
- 支援 GitHub Pages 靜態託管（公測網址發布）。
- 修改 `public/app.js` 支援動態環境判定。

### [1.0.0] - 2026-03-14
- **初始版本發布**
- 實作「做多」策略判定邏輯 (SMA + MACD)。
- 支援 BTC 與台指期資料抓取。
- 完成側邊欄式現代化 UI 介面。
- 整合 SQLite 資料庫預留空間。
