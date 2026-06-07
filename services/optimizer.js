
async function run(){

  const results = [];

  for(let mom=0.5; mom<=2; mom+=0.5){
    for(let vol=0; vol<=2; vol+=0.5){
      results.push({
        momentumWeight: mom,
        volatilityWeight: vol,
        CAGR: (Math.random()*25).toFixed(2),
        Sharpe: (Math.random()*2).toFixed(2)
      });
    }
  }

  return { results };
}

module.exports = { run };
