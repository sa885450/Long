const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { fetchBinanceKlines, fetchYahooKlines } = require('./data-fetcher');
const { analyzeLongStrategy } = require('./strategy-engine');

const app = express();
const PORT = process.env.PORT || 3005;
const myCache = new NodeCache({ stdTTL: 120 }); // 快取延長至 120 秒

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // 提供靜態檔案

app.get('/api/analyze', async (req, res) => {
    const { symbol, interval } = req.query;
    const cacheKey = `${symbol}_${interval}`;

    // 針對台股符號優化
    const finMindSymbol = symbol.includes('TXF') ? 'TXF' : 'TXF'; // 強制指向台指期
    const now = new Date();
    // 擴大到 90 天，確保資料充足
    const startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

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
            // 預設台指期：改用 TXF.RT (台指期近月) 或 WTX&F (小型台指)
            // 如果是在週末，TXF.RT 資料可能不連貫，建議增加備援
            const yahooSymbol = 'TXF.RT'; 
            klines = await fetchYahooKlines(yahooSymbol, interval);
        }

        console.log(`Successfully fetched ${klines.length} klines for ${symbol} (${interval})`);
        const result = analyzeLongStrategy(klines);
        
        // 存入快取
        myCache.set(cacheKey, result);
        
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('API Error:', error.message);
        if (error.response) {
            console.error('Data:', error.response.data);
            console.error('Status:', error.response.status);
        }
        res.status(500).json({ 
            success: false, 
            message: error.message,
            detail: error.response ? error.response.data : null 
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
