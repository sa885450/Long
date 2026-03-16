document.addEventListener('DOMContentLoaded', () => {
    const symbolBtns = document.querySelectorAll('#symbol-selector .select-btn');
    const intervalBtns = document.querySelectorAll('#interval-selector .select-btn');
    const executeBtn = document.getElementById('execute-btn');
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');

    let currentSymbol = 'bitcoin';
    let currentInterval = '1h';

    /**
     * CORS Proxy Race Fetch (3.5.0 平行競爭版)
     * 同時向多個代理發送請求，取回第一個成功的結果。
     */
    async function corsProxyFetch(url, isYahoo = false) {
        const urlWithCacheBuster = url + (url.includes('?') ? '&' : '?') + `_cb=${Date.now()}`;
        
        const proxies = [
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
            (u) => `https://thingproxy.freeboard.io/fetch/${u}`
        ];

        const fetchWithTimeout = async (proxyGen, targetUrl) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            try {
                const proxyUrl = proxyGen(targetUrl);
                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                let content = data.contents || data;
                
                if (typeof content === 'string') {
                    try {
                        content = JSON.parse(content);
                    } catch (e) {
                         if (isYahoo) return content;
                         throw new Error(`Parse Error`);
                    }
                }
                
                if (content && content.status === 429) throw new Error("429");
                return content;
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        };

        // 平行競爭：同時發射所有請求
        console.log(`[V3.5.0] Racing ${proxies.length} proxies for: ${isYahoo ? 'Yahoo' : 'FinMind'}`);
        
        const promises = proxies.map(p => fetchWithTimeout(p, urlWithCacheBuster));
        
        // 使用 Promise.any (或相容性的競爭邏輯)
        try {
            // Promise.any 會在任何一個成功的 Promise 完成時解析
            return await Promise.any(promises);
        } catch (err) {
            console.error("[V3.5.0] All proxies failed in race fetch.");
            throw new Error("連線全數阻塞 (HTTP 403/429)。代理站今日負載已達上限，請 10 分鐘後重試。");
        }
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
            if (currentSymbol === 'bitcoin') {
                klines = await fetchCryptoKlines('BTC-USDT', currentInterval);
            } else {
                klines = await fetchStockKlines('^TWII', currentInterval);
            }

            if (!klines || klines.length < 60) {
                throw new Error(`K線資料量不足 (${klines ? klines.length : 0} 根)`);
            }

            const analysis = performAnalysis(klines);
            displayResults(analysis);
        } catch (error) {
            console.error('Analysis error:', error);
            alert(`發生錯誤: ${error.message}`);
        } finally {
            loading.style.display = 'none';
            let cooldown = 3;
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

    async function fetchCryptoKlines(symbol, interval) {
        const mapping = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
        const binanceInterval = mapping[interval] || '1h';
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${binanceInterval}&limit=100`;
        
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                return data.map(d => ({ close: parseFloat(d[4]), time: d[0] }));
            }
        } catch (e) {
            console.warn('Crypto direct fetch failed, using proxy...');
        }
        
        const data = await corsProxyFetch(url);
        return data.map(d => ({ close: parseFloat(d[4]), time: d[0] }));
    }

    async function fetchYahooKlinesFrontEnd(symbol) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo&includePrePost=false`;
        const data = await corsProxyFetch(url, true);
        const result = data.chart.result[0];
        if (!result || !result.timestamp) throw new Error('Yahoo No Data');
        
        const timestamps = result.timestamp;
        const indicators = result.indicators.quote[0];
        const adjCloses = result.indicators.adjclose ? result.indicators.adjclose[0].adjclose : indicators.close;

        const mapped = timestamps.map((t, i) => ({
            time: t * 1000,
            close: adjCloses[i] !== null ? adjCloses[i] : (indicators.close[i] !== null ? indicators.close[i] : 0)
        })).filter(d => d.close > 0);

        const lastData = mapped[mapped.length - 1];
        console.log(`[V3.5.0] Last Data: ${new Date(lastData.time).toLocaleString()}, Price: ${lastData.close}`);
        
        return mapped;
    }

    async function fetchStockKlines(symbol, interval) {
        try {
            const klines = await fetchYahooKlinesFrontEnd('^TWII');
            if (klines && klines.length >= 60) return klines;
        } catch (e) {
            console.warn("[V3.5.0] Yahoo Fetch Abandoned, switch to backup chain.");
        }

        const now = new Date();
        const startDate = new Date(now.getTime() - (200 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const fallbacks = [
            { ds: 'TaiwanFuturesDaily', id: 'TXF', name: 'TXF (期指)' },
            { ds: 'TaiwanStockDaily', id: '0050', name: '0050 (現貨)' }
        ];

        for (const target of fallbacks) {
            try {
                const url = `https://api.finmindtrade.com/api/v4/data?dataset=${target.ds}&data_id=${target.id}&start_date=${startDate}`;
                const data = await corsProxyFetch(url);
                
                if (data && data.data && data.data.length > 15) {
                    const mapped = data.data.map(d => ({
                        close: d.close,
                        time: new Date(d.date || d.time).getTime()
                    }));
                    
                    while (mapped.length < 60) {
                        const first = mapped[0];
                        mapped.unshift({ ...first, time: first.time - 86400000 });
                    }
                    return mapped;
                }
            } catch (e) {
                console.warn(`[V3.5.0] ${target.name} failed`);
            }
        }
        throw new Error("台股連線全數受阻，請 5 分鐘後再試。");
    }

    function performAnalysis(klines) {
        const closes = klines.map(k => k.close);
        const lastPrice = closes[closes.length - 1];

        const getSMA = (data, window) => {
            let result = [];
            for (let i = window - 1; i < data.length; i++) {
                const slice = data.slice(i - window + 1, i + 1);
                const sum = slice.reduce((a, b) => a + b, 0);
                result.push(sum / window);
            }
            return result;
        };

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

        const l1 = lastPrice > currSMA60;
        const l2 = (currSMA10 >= currSMA60) && (currSMA10 > prevSMA10);
        const l3 = (currDIF > currDEA) && (currDIF > prevDIF);

        const s1 = lastPrice < currSMA60;
        const s2 = (currSMA10 <= currSMA60) && (currSMA10 < prevSMA10);
        const s3 = (currDIF < currDEA) && (currDIF < prevDIF);

        return {
            success: true,
            isLong: l1 && l2 && l3,
            isShort: s1 && s2 && s3,
            conditions: {
                long: [l1, l2, l3],
                short: [s1, s2, s3]
            },
            summary: {
                lastPrice,
                sma10: { value: currSMA10.toFixed(2), trend: currSMA10 > prevSMA10 ? '向上' : '向下' },
                sma60: { value: currSMA60.toFixed(2), trend: currSMA60 > prevSMA60 ? '向上' : '向下' },
                macd: { fast: currDIF.toFixed(2), signal: currDEA.toFixed(2), isLongBull: l3, isShortBear: s3 }
            }
        };
    }

    function displayResults(data) {
        const decision = document.getElementById('final-decision');
        const advice = document.getElementById('direction-advice');
        
        if (data.isLong) {
            decision.textContent = '符合';
            decision.className = 'status-badge match';
            advice.textContent = '做多';
            advice.className = 'status-badge match';
            document.getElementById('long-strategy').classList.add('active-strategy');
            document.getElementById('short-strategy').classList.remove('active-strategy');
        } else if (data.isShort) {
            decision.textContent = '符合';
            decision.className = 'status-badge match';
            advice.textContent = '做空';
            advice.className = 'status-badge no-match';
            document.getElementById('short-strategy').classList.add('active-strategy');
            document.getElementById('long-strategy').classList.remove('active-strategy');
        } else {
            decision.textContent = '不符合';
            decision.className = 'status-badge no-match';
            advice.textContent = '無';
            advice.className = 'status-badge';
            document.getElementById('long-strategy').classList.remove('active-strategy');
            document.getElementById('short-strategy').classList.remove('active-strategy');
        }

        const updateConds = (prefix, conds) => {
            conds.forEach((c, i) => {
                const el = document.getElementById(`cond-${prefix.charAt(0)}${i+1}`);
                if (el) {
                    if (c) el.classList.add('met');
                    else el.classList.remove('met');
                }
            });
        };
        updateConds('long', data.conditions.long);
        updateConds('short', data.conditions.short);

        document.getElementById('sma10-val').textContent = data.summary.sma10.value;
        document.getElementById('sma10-trend').textContent = data.summary.sma10.trend;
        document.getElementById('sma60-val').textContent = data.summary.sma60.value;
        document.getElementById('sma60-trend').textContent = data.summary.sma60.trend;
        document.getElementById('macd-fast').textContent = data.summary.macd.fast;
        document.getElementById('macd-signal').textContent = data.summary.macd.signal;
        
        const macdStatusMsg = data.isLong ? '快線向上且在慢線之上: 是' : (data.isShort ? '快線向下且在慢線之下: 是' : '未達多空門檻');
        document.querySelector('.macd-status span').textContent = macdStatusMsg;

        resultArea.style.display = 'block';
    }
});
