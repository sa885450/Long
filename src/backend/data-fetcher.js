const axios = require('axios');

/**
 * Binance K-Line 資料抓取
 * @param {string} symbol - 商品代號 (例如 BTCUSDT)
 * @param {string} interval - 週期 (5m, 15m, 1h, 4h, 1d)
 * @returns {Promise<Array>} OHLCV 資料
 */
async function fetchBinanceKlines(symbol, interval) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: {
                symbol: symbol,
                interval: interval,
                limit: 100 // 獲取足夠計算指標的量 (SMA60 需要至少 60 根)
            }
        });
        
        return response.data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));
    } catch (error) {
        console.error('Error fetching Binance data:', error.message);
        throw error;
    }
}

/**
 * Yahoo Finance K-Line 資料抓取 (用於台指期)
 * 注意：Yahoo Finance API 週期參數不同
 * @param {string} symbol - 商品代號 (例如 ^TWII)
 * @param {string} interval - 週期 (5m, 15m, 1h, 1d)
 */
async function fetchYahooKlines(symbol, interval) {
    // 將 UI 週期對應到 Yahoo Finance 週期
    const intervalMap = {
        '5m': '5m',
        '15m': '15m',
        '1h': '60m',
        '4h': '60m', // Yahoo Finance 可能沒有原生的 4h，此處用 60m 模擬或報錯
        '1d': '1d'
    };

    const yahooInterval = intervalMap[interval] || '1d';
    const range = yahooInterval === '1d' ? '1y' : '1mo'; // 根據週期決定抓取範圍

    try {
        // 使用 yfinance 公開 API 或類似的 endpoint
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
            params: {
                interval: yahooInterval,
                range: range
            }
        });

        const result = response.data.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];

        return timestamps.map((t, i) => ({
            time: t * 1000,
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: quotes.close[i],
            volume: quotes.volume[i]
        })).filter(d => d.close !== null); // 過濾掉空值
    } catch (error) {
        console.error('Error fetching Yahoo data:', error.message);
        throw error;
    }
}

module.exports = {
    fetchBinanceKlines,
    fetchYahooKlines
};
