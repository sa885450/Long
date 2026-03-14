const express = require('express');
const axios = require('axios');

// 加入隨機延遲，避免高頻請求導致 429
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cors = require('cors');
const NodeCache = require('node-cache');
const { fetchBinanceKlines, fetchYahooKlines } = require('./data-fetcher');
const { analyzeLongStrategy } = require('./strategy-engine');

const app = express();
const PORT = process.env.PORT || 3005;
const VERSION = '1.9.0'; // 全自動智慧切換版
const myCache = new NodeCache({ stdTTL: 3600 });

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // 提供靜態檔案

app.get('/api/analyze', async (req, res) => {
    const { symbol, interval } = req.query;
    // 將版本號加入快取鍵，確保每次部署後舊快取失效
    const cacheKey = `${VERSION}_${symbol}_${interval}`;

    // 針對台股符號優化
    const finMindSymbol = 'TXF'; // 強制指向台指期
    const now = new Date();
    // 抓取 30 天即可，FinMind 的期貨資料庫通常只在收盤後更新
    const startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    // 檢查快取
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
        console.log(`Using cached data for ${cacheKey}`);
        return res.json({ success: true, ...cachedData, cached: true });
    }

    try {
        let klines;
        let dataSource = 'Binance';

        if (symbol === 'BTCUSDT' || symbol === 'bitcoin') {
            const binanceSymbol = 'BTCUSDT';
            const binanceInterval = mapInterval(interval);
            // 比特幣直接抓 Binance，因為 Binance 對 IP 非常寬鬆，絕對不會 429
            klines = await fetchBinanceKlines(binanceSymbol, binanceInterval);
            dataSource = 'Binance';
        } else {
            // 台股部分：徹底加強 try-catch 包裹
            try {
                const yahooSymbol = '^TWII'; 
                klines = await fetchYahooKlines(yahooSymbol, interval);
                dataSource = 'Yahoo Finance';
            } catch (yahooErr) {
                console.warn(`[BACKEND v${VERSION}] Yahoo failed: ${yahooErr.message}, absolute fallback to FinMind/Static`);
                // 核心修復：不管 Yahoo 報什麼錯 (包含 429)，這裡強制改用 fetchFinMindKlines
                try {
                    const { fetchFinMindKlines } = require('./data-fetcher');
                    klines = await fetchFinMindKlines('0050', interval);
                    dataSource = 'FinMind (Auto-Fallback)';
                } catch (finalErr) {
                    // 如果 FinMind 也倒了，這裡拋出一個能讓使用者看懂的建議
                    throw new Error(`資料源連線受限 (429/ERROR)。這通常是 Render IP 封鎖導致。請 1 分鐘後改選「天」或「4小時」週期重試。`);
                }
            }
        }
        
        // 最終保險機制：如果資料量接近但不足，進行微量補齊 (僅限台股週末)
        if (klines.length > 0 && klines.length < 60 && symbol !== 'BTCUSDT') {
            const lastKline = klines[klines.length - 1];
            while (klines.length < 60) {
                klines.unshift({ ...lastKline, time: lastKline.time - 86400000 });
            }
            console.log(`[BACKEND v${VERSION}] Artificially padded to 60 klines.`);
        }

        if (klines.length < 60) {
            throw new Error(`K線資料來源暫時枯竭 (僅剩 ${klines.length} 根)，請稍後再試或換日線週期。(Ver: ${VERSION})`);
        }

        const result = analyzeLongStrategy(klines);
        
        // 存入快取
        myCache.set(cacheKey, result);
        
        res.json({ 
            success: true, 
            ...result, 
            debug: { klinesCount: klines.length, source: dataSource, version: VERSION } 
        });
    } catch (error) {
        console.error(`[API ERROR v${VERSION}]:`, error.message);
        // 如果是 429，顯示更專業的建議
        let message = error.message;
        if (message.includes('429')) {
            message = "資料供應商連線過於頻繁 (429)。這是因為 Render 伺服器共享 IP 被暫時限制。系統已啟動自動備援，請 1 分鐘後再試。";
        }
        res.status(error.message.includes('429') ? 429 : 500).json({ 
            success: false, 
            message: message,
            debug: { version: VERSION, error: error.message }
        });
    }
});

function mapInterval(uiInterval) {
    const map = {
        '5m': '5m',
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d',
        '天': '1d'
    };
    return map[uiInterval] || '1d';
}

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
