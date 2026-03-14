document.addEventListener('DOMContentLoaded', () => {
    const symbolBtns = document.querySelectorAll('#symbol-selector .select-btn');
    const intervalBtns = document.querySelectorAll('#interval-selector .select-btn');
    const executeBtn = document.getElementById('execute-btn');
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');

    let currentSymbol = 'bitcoin';
    let currentInterval = '1h';

    async function corsProxyFetch(url, isYahoo = false) {
        // 多重代理清單
        const proxies = [
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
            (u) => `https://thingproxy.freeboard.io/fetch/${u}`
        ];

        let lastError;
        for (const proxyGen of proxies) {
            try {
                const proxyUrl = proxyGen(url);
                console.log(`[V2.5.0] Trying proxy for ${isYahoo ? 'Yahoo' : 'FinMind'}: ${proxyUrl}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 12000); // 延長至 12s
                
                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                let content = data.contents || data;
                
                if (typeof content === 'string') {
                    try {
                        content = JSON.parse(content);
                    } catch (e) {
                         // 對於 Yahoo，有時回傳不是 JSON
                         if (isYahoo) return content; 
                         throw new Error(`JSON Parse Error: ${content.substring(0, 50)}`);
                    }
                }
                
                if (content && content.status === 429) throw new Error("API 429");

                return content;
            } catch (err) {
                lastError = err;
                console.warn(`Proxy failed: ${err.message}`);
                if (err.message.includes("429")) break;
            }
        }
        throw new Error(lastError ? lastError.message : "通訊異常");
    }

    // 選擇商品
    symbolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            symbolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSymbol = btn.dataset.value;
        });
    });

    // 選擇週期
    intervalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            intervalBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentInterval = btn.dataset.value;
        });
    });

    // 執行分析
    executeBtn.addEventListener('click', async function runAnalysis() {
        if (executeBtn.disabled) return;

        executeBtn.disabled = true;
        const originalBtnText = executeBtn.innerText;
        executeBtn.innerText = '分析中...';
        
        loading.style.display = 'block';
        resultArea.style.display = 'none';

        try {
            let klines;
            console.log(`[V2.0.0] Starting client-side analysis for ${currentSymbol} @ ${currentInterval}`);
            
            if (currentSymbol === 'bitcoin') {
                klines = await fetchCryptoKlines('BTC-USDT', currentInterval);
            } else {
                klines = await fetchStockKlines('^TWII', currentInterval);
            }

            if (!klines || klines.length < 60) {
                throw new Error(`K線資料量不足 (${klines ? klines.length : 0} 根)，分析無法進行。請稍後再試。`);
            }

            const analysis = performAnalysis(klines);
            displayResults(analysis);
        } catch (error) {
            console.error('Analysis error:', error);
            alert(`發生錯誤: ${error.message}`);
        } finally {
            loading.style.display = 'none';
            // 實施 5 秒冷卻時間
            let cooldown = 5;
            const timer = setInterval(() => {
                executeBtn.innerText = `冷卻中 (${cooldown}s)`;
                cooldown--;
                if (cooldown < 0) {
                    clearInterval(timer);
                    executeBtn.disabled = false;
                    executeBtn.innerText = originalBtnText;
                }
            }, 1000);
        }
    });

    /**
     * 前端資料獲取: 加密貨幣 (使用 Binance Public API 或其他無需 CORS 的來源)
     */
    async function fetchCryptoKlines(symbol, interval) {
        // 使用 Binance Public API
        const mapping = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
        const binanceInterval = mapping[interval] || '1h';
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${binanceInterval}&limit=100`;
        
        // 直接 Fetch 如果失敗 (通常是 CORS)，則走 Proxy
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                return data.map(d => ({ close: parseFloat(d[4]), time: d[0] }));
            }
        } catch (e) {
            console.warn('Direct fetch failed, trying CORS Proxy for Binance...');
        }
        
        const data = await corsProxyFetch(url);
        return data.map(d => ({
            close: parseFloat(d[4]),
            time: d[0]
        }));
    }

    /**
     * 前端版 Yahoo Finance 抓取 (透過 Proxy)
     */
    async function fetchYahooKlinesFrontEnd(symbol) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
        const data = await corsProxyFetch(url, true);
        
        const result = data.chart.result[0];
        if (!result || !result.timestamp) throw new Error('Yahoo No Data');
        
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];
        return timestamps.map((t, i) => ({
            time: t * 1000,
            close: quotes.close[i],
            dateStr: new Date(t * 1000).toISOString().split('T')[0]
        })).filter(d => d.close != null);
    }

    async function fetchStockKlines(symbol, interval) {
        // 先嘗試 Yahoo (因其對週末資料較友善)
        try {
            console.log("[V2.5.0] Primary: Attempting Yahoo Finance...");
            const klines = await fetchYahooKlinesFrontEnd('^TWII');
            if (klines.length >= 60) return klines;
        } catch (e) {
            console.warn("Yahoo Primary failed:", e.message);
        }

        const now = new Date();
        const startDate = new Date(now.getTime() - (150 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        
        const datasets = [
            { ds: 'TaiwanStockDaily', id: '0050', name: 'FinMind-0050' },
            { ds: 'TaiwanFuturesDaily', id: 'TXF', name: 'FinMind-TXF' }
        ];

        let lastErr;
        for (const target of datasets) {
            try {
                const url = `https://api.finmindtrade.com/api/v4/data?dataset=${target.ds}&data_id=${target.id}&start_date=${startDate}`;
                console.log(`[V2.5.0] Secondary: Fetching ${target.name}...`);
                
                const data = await corsProxyFetch(url);
                if (data && data.data && data.data.length > 30) {
                    const mapped = data.data.map(d => ({
                        close: d.close,
                        time: new Date(d.date || d.time).getTime(),
                        dateStr: d.date || '--'
                    }));
                    
                    while (mapped.length < 60) {
                        const first = mapped[0];
                        mapped.unshift({ ...first, time: first.time - 86400000 });
                    }
                    return mapped;
                }
            } catch (e) {
                lastErr = e;
                if (e.message.includes("429")) throw e;
            }
        }

        throw new Error(`所有路徑皆失敗 (${lastErr ? lastErr.message : '403/Blocked'})。這代表公共 Proxy 集群今日已達上限。請按 Ctrl+F5 刷新網頁，或待會再試。`);
    }

    /**
     * 前端技術分析 (SMA + MACD)
     */
    function performAnalysis(klines) {
        const closes = klines.map(k => k.close);
        const lastPrice = closes[closes.length - 1];

        // 簡易 SMA 實作 (避免依賴外部庫)
        const getSMA = (data, window) => {
            let result = [];
            for (let i = window - 1; i < data.length; i++) {
                const slice = data.slice(i - window + 1, i + 1);
                const sum = slice.reduce((a, b) => a + b, 0);
                result.push(sum / window);
            }
            return result;
        };

        // 簡易 EMA 實作
        const getEMA = (data, window) => {
            const k = 2 / (window + 1);
            let emaArr = [data[0]];
            for (let i = 1; i < data.length; i++) {
                emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
            }
            return emaArr;
        };

        const sma10 = getSMA(closes, 10);
        const sma60 = getSMA(closes, 60);

        // MACD (12, 26, 9)
        const ema12 = getEMA(closes, 12);
        const ema26 = getEMA(closes, 26);
        const dif = ema12.map((v, i) => v - ema26[i]);
        const dea = getEMA(dif, 9);
        
        const currSMA10 = sma10[sma10.length - 1];
        const prevSMA10 = sma10[sma10.length - 2];
        const currSMA60 = sma60[sma60.length - 1];
        const prevSMA60 = sma60[sma60.length - 2];
        const currDIF = dif[dif.length - 1];
        const currDEA = dea[dea.length - 1];
        const prevDIF = dif[dif.length - 2];

        // 判斷
        const cond1 = lastPrice > currSMA60;
        const cond2 = (currSMA10 > currSMA60) && (currSMA10 > prevSMA10);
        const cond3 = (currDIF > currDEA) && (currDIF > prevDIF);

        return {
            success: true,
            isMatch: cond1 && cond2 && cond3,
            summary: {
                lastPrice,
                sma10: { value: currSMA10.toFixed(2), trend: currSMA10 > prevSMA10 ? '向上' : '向下' },
                sma60: { value: currSMA60.toFixed(2), trend: currSMA60 > prevSMA60 ? '向上' : '向下' },
                macd: { fast: currDIF.toFixed(2), signal: currDEA.toFixed(2), isBullish: cond3 ? '是' : '否' }
            }
        };
    }

    function displayResults(data) {
        const decision = document.getElementById('final-decision');
        
        // 綜合判定
        decision.textContent = data.isMatch ? '符合' : '不符合';
        decision.className = 'status-badge ' + (data.isMatch ? 'match' : 'no-match');

        // SMA10
        document.getElementById('sma10-val').textContent = data.summary.sma10.value;
        document.getElementById('sma10-trend').textContent = data.summary.sma10.trend;

        // SMA60
        document.getElementById('sma60-val').textContent = data.summary.sma60.value;
        document.getElementById('sma60-trend').textContent = data.summary.sma60.trend;

        // MACD
        document.getElementById('macd-fast').textContent = data.summary.macd.fast;
        document.getElementById('macd-signal').textContent = data.summary.macd.signal;
        document.getElementById('macd-bullish').textContent = data.summary.macd.isBullish;

        resultArea.style.display = 'block';
    }
});
