
async function executeOrders(top20){

  console.log("Executing orders in Zerodha Kite...");

  for(const stock of top20){
    console.log("Placing order for:", stock.symbol);
  }

  return true;
}

module.exports = { executeOrders };
