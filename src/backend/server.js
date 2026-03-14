const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { fetchBinanceKlines, fetchYahooKlines } = require('./data-fetcher');
const { analyzeLongStrategy } = require('./strategy-engine');

const app = express();
const PORT = process.env.PORT || 3005;
const myCache = new NodeCache({ stdTTL: 60 }); // 快取 60 秒

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // 提供靜態檔案

app.get('/api/analyze', async (req, res) => {
    const { symbol, interval } = req.query;
    const cacheKey = `${symbol}_${interval}`;

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
            // 預設台指期
            const yahooSymbol = '^TWII'; // 這裡可以根據實際細化
            const yahooInterval = interval;
            klines = await fetchYahooKlines(yahooSymbol, yahooInterval);
        }

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
