document.addEventListener('DOMContentLoaded', () => {
    const symbolBtns = document.querySelectorAll('#symbol-selector .select-btn');
    const intervalBtns = document.querySelectorAll('#interval-selector .select-btn');
    const executeBtn = document.getElementById('execute-btn');
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');

    // 判定 API 網址：如果是在 GitHub Pages 上，則需要手動指定您的 Render API 網址
    // 您可以在部署完 Render 後，回過頭來修改這裡的 'https://your-app-name.onrender.com'
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? '' 
        : 'https://long-4q43.onrender.com'; 

    let currentSymbol = 'bitcoin';
    let currentInterval = '1h';

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
            const response = await fetch(`${API_BASE_URL}/api/analyze?symbol=${currentSymbol}&interval=${currentInterval}`);
            const data = await response.json();

            if (data.success) {
                displayResults(data);
            } else {
                alert('發生錯誤: ' + data.message);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            let msg = error.message;
            if (error.response && error.response.data && error.response.data.debug) {
                const debug = error.response.data.debug;
                msg += ` (K線數: ${debug.klinesCount || 0}, 版本: ${debug.version})`;
            }
            alert(`發生錯誤: ${msg}`);
        } finally {
            loading.style.display = 'none';
            
            // 實施 3 秒冷卻時間，防止連點
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
