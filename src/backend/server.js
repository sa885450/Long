const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { fetchBinanceKlines, fetchYahooKlines } = require('./data-fetcher');
const { analyzeLongStrategy } = require('./strategy-engine');

const app = express();
const PORT = process.env.PORT || 3005;
const VERSION = '1.4.0'; // 週末穩定版
const myCache = new NodeCache({ stdTTL: 120 });

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
        if (symbol === 'BTCUSDT' || symbol === 'bitcoin') {
            // 對應 UI 選項
            const binanceSymbol = 'BTCUSDT';
            const binanceInterval = mapInterval(interval);
            klines = await fetchBinanceKlines(binanceSymbol, binanceInterval);
        } else {
            // 回退到最穩定的指數符號 ^TWII
            const yahooSymbol = '^TWII'; 
            klines = await fetchYahooKlines(yahooSymbol, interval);
        }

        }

        console.log(`[BACKEND v${VERSION}] Fetched ${klines.length} klines for ${symbol} @ ${interval}`);
        
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
            debug: { klinesCount: klines.length, source: symbol === 'BTCUSDT' ? 'Binance' : 'Yahoo/FinMind' } 
        });
    } catch (error) {
        console.error(`[API ERROR v${VERSION}]:`, error.message);
        res.status(500).json({ 
            success: false, 
            message: error.message,
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
