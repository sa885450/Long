const { SMA, MACD } = require('technicalindicators');

/**
 * 策略邏輯判斷 ENGINE
 */
function analyzeLongStrategy(klines) {
    const closes = klines.map(k => k.close);
    const lastPrice = closes[closes.length - 1];

    // 1. 計算 SMA10
    const sma10Values = SMA.calculate({ period: 10, values: closes });
    const currentSMA10 = sma10Values[sma10Values.length - 1];
    const prevSMA10 = sma10Values[sma10Values.length - 2];

    // 2. 計算 SMA60
    const sma60Values = SMA.calculate({ period: 60, values: closes });
    const currentSMA60 = sma60Values[sma60Values.length - 1];
    const prevSMA60 = sma60Values[sma60Values.length - 2];

    // 3. 計算 MACD
    const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    };
    const macdValues = MACD.calculate(macdInput);
    const currentMACD = macdValues[macdValues.length - 1];
    const prevMACD = macdValues[macdValues.length - 2];

    // --- 判斷條件 (做多) ---
    
    // 條件 1: 收盤價 > SMA60
    const cond1 = lastPrice > currentSMA60;

    // 條件 2: SMA10 > SMA60 且 SMA10 趨勢向上
    const cond2_cross = currentSMA10 > currentSMA60;
    const cond2_trend = currentSMA10 > prevSMA10;
    const cond2 = cond2_cross && cond2_trend;

    // 條件 3: MACD 快線 > 慢線 且 快線趨勢向上
    const cond3_cross = currentMACD.MACD > currentMACD.signal;
    const cond3_trend = currentMACD.MACD > prevMACD.MACD;
    const cond3 = cond3_cross && cond3_trend;

    const isMatch = cond1 && cond2 && cond3;

    return {
        isMatch,
        summary: {
            lastPrice,
            sma10: {
                value: currentSMA10.toFixed(2),
                trend: cond2_trend ? '向上' : '向下'
            },
            sma60: {
                value: currentSMA60.toFixed(2),
                trend: (currentSMA60 > prevSMA60) ? '向上' : '向下'
            },
            macd: {
                fast: currentMACD.MACD.toFixed(2),
                signal: currentMACD.signal.toFixed(2),
                isBullish: cond3_cross && cond3_trend ? '是' : '否'
            }
        },
        conditions: {
            priceAboveSMA60: cond1,
            smaLongArrangement: cond2_cross,
            sma10TrendingUp: cond2_trend,
            macdBullishCross: cond3_cross,
            macdFastTrendingUp: cond3_trend
        }
    };
}

module.exports = {
    analyzeLongStrategy
};
