document.addEventListener('DOMContentLoaded', () => {
    const symbolBtns = document.querySelectorAll('#symbol-selector .select-btn');
    const intervalBtns = document.querySelectorAll('#interval-selector .select-btn');
    const executeBtn = document.getElementById('execute-btn');
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');

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
    executeBtn.addEventListener('click', async () => {
        loading.style.display = 'block';
        resultArea.style.display = 'none';

        try {
            const response = await fetch(`/api/analyze?symbol=${currentSymbol}&interval=${currentInterval}`);
            const data = await response.json();

            if (data.success) {
                displayResults(data);
            } else {
                alert('發生錯誤: ' + data.message);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            alert('無法連接到後端服務');
        } finally {
            loading.style.display = 'none';
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
