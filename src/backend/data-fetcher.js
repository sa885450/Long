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
    // 1. 嘗試所有 Binance 端點
    for (const base of endpoints) {
        try {
            const response = await axios.get(`${base}/api/v3/klines`, {
                params: { symbol, interval, limit: 100 },
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
            console.warn(`Binance endpoint ${base} failed: ${error.message}`);
            // 如果不是區域封鎖 (451)，通常是頻度限制或其他問題，直接跳出嘗試備援
            if (error.response && error.response.status !== 451) break;
        }
    }

    // 如果 Binance 失敗且是區域封鎖 (451)，啟動備援鏈
    if (lastError && lastError.response && lastError.response.status === 451) {
        console.warn('Binance regional block (451), starting fallback chain...');
        
        // 2. 備援 A: CryptoCompare
        try {
            console.log('Attempting CryptoCompare...');
            return await fetchCryptoCompareKlines(symbol, interval);
        } catch (ccError) {
            console.warn(`CryptoCompare failed: ${ccError.message}, trying OKX...`);
            
            // 3. 備援 B: OKX
            try {
                console.log('Attempting OKX...');
                return await fetchOKXKlines(symbol, interval);
            } catch (okxError) {
                console.warn(`OKX failed: ${okxError.message}, trying Yahoo Finance...`);
                
                // 4. 最後備援: Yahoo Finance
                try {
                    console.log('Attempting Yahoo Finance (Final Fallback)...');
                    return await fetchYahooKlines('BTC-USD', interval);
                } catch (yahooError) {
                    throw new Error(`比特幣資料獲取失敗。已嘗試 Binance(451)、CryptoCompare、OKX 與 Yahoo Finance 皆失效。最後錯誤: ${yahooError.message}`);
                }
            }
        }
    }
    
    // 如果不是 451 卻失敗了 (例如 429)，直接拋出最後一個錯誤
    throw lastError;
}

/**
 * OKX 備援機制 (通常對雲端 IP 較友好)
 */
async function fetchOKXKlines(symbol, interval) {
    const okxIntervalMap = {
        '5m': '5m',
        '15m': '15m',
        '1h': '1H',
        '4h': '4H',
        '1d': '1D'
    };
    const instId = symbol.replace('USDT', '-USDT').toUpperCase();
    const bar = okxIntervalMap[interval] || '1D';

    const response = await axios.get('https://www.okx.com/api/v5/market/candles', {
        params: { instId, bar, limit: 100 },
        timeout: 5000
    });

    if (response.data.code !== "0") throw new Error(response.data.msg);

    return response.data.data.map(d => ({
        time: parseInt(d[0]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
    })).reverse(); // OKX 回傳順序是倒序
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
    // 之前用 1mo 在 5分線可能導致資料點不足 60 根 (5分線 1個月大約有幾千根，但 Yahoo 有時有限制頻率)
    // 這裡我們確保針對分線抓取至少 1 個月的資料，針對日線抓取 1 年
    const range = (yahooInterval.includes('m')) ? '1mo' : '1y'; 

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
        console.warn(`Yahoo Finance failed for ${symbol}: ${error.message}, trying FinMind...`);
        try {
            return await fetchFinMindKlines(symbol, interval);
        } catch (fmError) {
            console.error('Final fallback failed:', fmError.message);
            throw error; // 仍然拋出原爆錯 (429)，因為 FinMind 如果也失敗通常是連線問題
        }
    }
}

/**
 * FinMind 備援 (台股資料源)
 */
async function fetchFinMindKlines(symbol, interval) {
    // 簡單映射，FinMind 通常需要日期範圍
    const finMindSymbol = symbol.startsWith('^') ? 'TXF' : symbol;
    const now = new Date();
    // 將 30 天擴大到 60 天，確保即便扣除假日，分線或日線資料也絕對超過 60 根
    const startDate = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    const response = await axios.get('https://api.finmindtrade.com/api/v4/data', {
        params: {
            dataset: 'TaiwanFuturesDaily',
            data_id: finMindSymbol,
            start_date: startDate
        }
    });

    if (!response.data || response.data.status !== 200) throw new Error('FinMind API Error');

    return response.data.data.map(d => ({
        time: new Date(d.date).getTime(),
        open: d.open,
        high: d.max,
        low: d.min,
        close: d.close,
        volume: d.volume
    }));
}

module.exports = {
    fetchBinanceKlines,
    fetchYahooKlines
};
