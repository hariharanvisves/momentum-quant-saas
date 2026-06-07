import { useState } from "react"
import Layout from "./components/Layout"
import ScannerPanel from "./components/ScannerPanel"
import BacktestPanel from "./components/BacktestPanel"
import OptimizerPanel from "./components/OptimizerPanel"
import RebalancePanel from "./components/RebalancePanel"

export default function App() {
  const [tab, setTab] = useState("scanner")

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === "scanner" && <ScannerPanel />}
      {tab === "backtest" && <BacktestPanel />}
      {tab === "optimizer" && <OptimizerPanel />}
      {tab === "rebalance" && <RebalancePanel />}
    </Layout>
  )
}
