// services/indicators.js
//
// Technical indicators for regime filtering.
// Supertrend is an ATR-based trend-following indicator.
// When price is above the Supertrend line, trend is bullish.
// When price is below, trend is bearish.

function calcATR(highs, lows, closes, period) {
  const trueRanges = []
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) {
      trueRanges.push(highs[i] - lows[i])
    } else {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
      trueRanges.push(tr)
    }
  }

  const atr = new Array(trueRanges.length).fill(0)
  let sum = 0
  for (let i = 0; i < period && i < trueRanges.length; i++) {
    sum += trueRanges[i]
  }
  if (period <= trueRanges.length) {
    atr[period - 1] = sum / period
  }
  for (let i = period; i < trueRanges.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trueRanges[i]) / period
  }

  return atr
}

function calcSupertrend(highs, lows, closes, period = 10, multiplier = 3) {
  const n = closes.length
  if (n < period + 1) {
    return { trend: new Array(n).fill(1), supertrendLine: new Array(n).fill(0) }
  }

  const atr = calcATR(highs, lows, closes, period)

  const upperBand = new Array(n).fill(0)
  const lowerBand = new Array(n).fill(0)
  const finalUpperBand = new Array(n).fill(0)
  const finalLowerBand = new Array(n).fill(0)
  const supertrendLine = new Array(n).fill(0)
  const trend = new Array(n).fill(1) // 1 = bullish, -1 = bearish

  for (let i = 0; i < n; i++) {
    const hl2 = (highs[i] + lows[i]) / 2
    upperBand[i] = hl2 + multiplier * atr[i]
    lowerBand[i] = hl2 - multiplier * atr[i]
  }

  finalUpperBand[0] = upperBand[0]
  finalLowerBand[0] = lowerBand[0]

  for (let i = 1; i < n; i++) {
    finalLowerBand[i] = (lowerBand[i] > finalLowerBand[i - 1]) || (closes[i - 1] < finalLowerBand[i - 1])
      ? lowerBand[i]
      : finalLowerBand[i - 1]

    finalUpperBand[i] = (upperBand[i] < finalUpperBand[i - 1]) || (closes[i - 1] > finalUpperBand[i - 1])
      ? upperBand[i]
      : finalUpperBand[i - 1]
  }

  trend[0] = 1
  supertrendLine[0] = finalLowerBand[0]

  for (let i = 1; i < n; i++) {
    if (trend[i - 1] === 1) {
      trend[i] = closes[i] < finalLowerBand[i] ? -1 : 1
    } else {
      trend[i] = closes[i] > finalUpperBand[i] ? 1 : -1
    }
    supertrendLine[i] = trend[i] === 1 ? finalLowerBand[i] : finalUpperBand[i]
  }

  return { trend, supertrendLine }
}

module.exports = { calcSupertrend, calcATR }
