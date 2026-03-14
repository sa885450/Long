const axios = require('axios');

/**
 * Binance K-Line 資料抓取
 * @param {string} symbol - 商品代號 (例如 BTCUSDT)
 * @param {string} interval - 週期 (5m, 15m, 1h, 4h, 1d)
 * @returns {Promise<Array>} OHLCV 資料
 */
async function fetchBinanceKlines(symbol, interval) {
    const endpoints = [
        'https://api.binance.com',
        'https://api1.binance.com',
        'https://api2.binance.com',
        'https://api3.binance.com'
    ];

    let lastError;
    for (const base of endpoints) {
        try {
            const response = await axios.get(`${base}/api/v3/klines`, {
                params: {
                    symbol: symbol,
                    interval: interval,
                    limit: 100
                },
                timeout: 5000
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
            lastError = error;
            // 如果是 451 (法律因素區域封鎖)，繼續嘗試下一個端點，或者如果全部失敗則噴錯
            console.warn(`Binance endpoint ${base} failed: ${error.message}`);
            if (error.response && error.response.status !== 451) break; 
        }
    }
    
    // 如果 Binance 全部失敗且是 451，嘗試使用 CryptoCompare 作為備援
    if (lastError && lastError.response && lastError.response.status === 451) {
        console.warn('Binance regional block (451), attempting CryptoCompare fallback...');
        try {
            return await fetchCryptoCompareKlines(symbol, interval);
        } catch (ccError) {
            throw new Error(`比特幣資料獲取失敗。Binance 區域封鎖 (451) 且備援 API 亦失效: ${ccError.message}`);
        }
    }
    throw lastError;
}

/**
 * CryptoCompare 備援機制 (無區域限制)
 */
async function fetchCryptoCompareKlines(symbol, interval) {
    const coin = symbol.replace('USDT', '').toUpperCase();
    const limit = 100;
    
    // 週期映射 (CryptoCompare API)
    let url = 'https://min-api.cryptocompare.com/data/v2/histominute';
    let aggregate = 1;

    if (interval === '5m') aggregate = 5;
    else if (interval === '15m') aggregate = 15;
    else if (interval === '1h') { url = 'https://min-api.cryptocompare.com/data/v2/histohour'; aggregate = 1; }
    else if (interval === '4h') { url = 'https://min-api.cryptocompare.com/data/v2/histohour'; aggregate = 4; }
    else if (interval === '1d') { url = 'https://min-api.cryptocompare.com/data/v2/histoday'; aggregate = 1; }

    const response = await axios.get(url, {
        params: {
            fsym: coin === 'BITCOIN' ? 'BTC' : coin,
            tsym: 'USDT',
            limit: limit,
            aggregate: aggregate
        }
    });

    if (response.data.Response === 'Error') throw new Error(response.data.Message);

    return response.data.Data.Data.map(d => ({
        time: d.time * 1000,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volumeto
    }));
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
