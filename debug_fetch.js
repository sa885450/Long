const axios = require('axios');

async function testYahoo(symbol, interval, range) {
    try {
        console.log(`Testing Yahoo: ${symbol}, interval: ${interval}, range: ${range}`);
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
            params: { interval, range },
            timeout: 5000
        });
        const result = response.data.chart.result[0];
        const count = result.timestamp ? result.timestamp.length : 0;
        console.log(`Yahoo Success! Count: ${count}`);
        return count;
    } catch (e) {
        console.error(`Yahoo Failed: ${e.message}`);
        return 0;
    }
}

async function testFinMind(data_id) {
    try {
        const now = new Date();
        const startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        console.log(`Testing FinMind: ${data_id}, from: ${startDate}`);
        const response = await axios.get('https://api.finmindtrade.com/api/v4/data', {
            params: {
                dataset: 'TaiwanFuturesDaily',
                data_id: data_id,
                start_date: startDate
            },
            timeout: 5000
        });
        const count = response.data.data ? response.data.data.length : 0;
        console.log(`FinMind Success! Count: ${count}`);
        return count;
    } catch (e) {
        console.error(`FinMind Failed: ${e.message}`);
        return 0;
    }
}

async function run() {
    console.log('--- START DIAGNOSTIC ---');
    // 1. 測試 Yahoo 不同的符號
    await testYahoo('TXF.RT', '5m', '5d');
    await testYahoo('TXF.RT', '60m', '1mo');
    await testYahoo('^TWII', '5m', '5d');
    
    // 2. 測試 FinMind
    await testFinMind('TXF');
    
    console.log('--- END DIAGNOSTIC ---');
}

run();
