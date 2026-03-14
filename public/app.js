document.addEventListener('DOMContentLoaded', () => {
    const symbolBtns = document.querySelectorAll('#symbol-selector .select-btn');
    const intervalBtns = document.querySelectorAll('#interval-selector .select-btn');
    const executeBtn = document.getElementById('execute-btn');
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');

    let currentSymbol = 'bitcoin';
    let currentInterval = '1h';

    /**
     * CORS Proxy Fetch 轉發器 (使用 allOrigins)
     * 用於解決瀏覽器無法直接 Fetch 第三方 API 的 CORS 限制
     */
    async function corsProxyFetch(url) {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy Fetch Failed: ${response.status}`);
        const data = await response.json();
        // allOrigins 會將原始 JSON 字串放在 data.contents 中
        return JSON.parse(data.contents);
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
     * 前端資料獲取: 台股 (透過 CORS Proxy 或 FinMind)
     */
    async function fetchStockKlines(symbol, interval) {
        const now = new Date();
        // 為了確保即便在連假期間也有足夠的日線資料 (SMA60)，我們抓取最近 120 天
        const startDate = new Date(now.getTime() - (120 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        // 改用 TaiwanStockDaily，因為 Month 資料集更新較慢，Daily 在盤後或隔日也能給出資料
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDaily&data_id=0050&start_date=${startDate}`;
        
        try {
            const data = await corsProxyFetch(url);
            if (!data.data || data.data.length === 0) throw new Error('FinMind API 無回傳資料');
            
            return data.data.map(d => ({
                close: d.close,
                time: new Date(d.date).getTime()
            }));
        } catch (e) {
            console.error('Stock fetch fail:', e);
            throw new Error(`獲取台股資料失敗: ${e.message}。可能是資料供應商限制，請稍後重試。`);
        }
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
