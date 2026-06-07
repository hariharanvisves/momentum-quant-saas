const backtest = require("./backtest")

const DEFAULT_GRID = {
  topN: [5, 10, 15, 20],
  rebalanceFrequency: [5, 10, 21, 42],
  lookbackSets: [
    [21, 63, 126, 189],
    [21, 63, 126, 252],
    [10, 42, 126, 189],
    [63, 126, 189, 252],
  ],
}

async function run(params = {}) {
  const {
    universe = "nifty50",
    symbolLimit = 15,
    grid = DEFAULT_GRID,
  } = params

  const results = []
  const combinations = []

  for (const topN of grid.topN) {
    for (const rebalFreq of grid.rebalanceFrequency) {
      for (const lookbacks of grid.lookbackSets) {
        combinations.push({ topN, rebalanceFrequency: rebalFreq, lookbacks })
      }
    }
  }

  console.log(`Optimizer: ${combinations.length} combinations to test`)

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i]
    try {
      console.log(`[${i + 1}/${combinations.length}] topN=${combo.topN} rebal=${combo.rebalanceFrequency} lb=[${combo.lookbacks}]`)
      const result = await backtest.run({
        universe,
        symbolLimit,
        ...combo,
      })
      results.push({
        ...combo,
        cagr: result.cagr,
        sharpe: result.sharpe,
        maxDrawdown: result.maxDrawdown,
        totalReturn: result.totalReturn,
      })
    } catch (e) {
      console.warn(`Optimizer skip combo: ${e.message}`)
    }
  }

  results.sort((a, b) => b.sharpe - a.sharpe)

  return {
    best: results[0] || null,
    results,
    combinationsTested: results.length,
    totalCombinations: combinations.length,
  }
}

module.exports = { run }
