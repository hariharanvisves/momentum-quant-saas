const tabs = [
  { id: "scanner", label: "Scanner" },
  { id: "backtest", label: "Backtest" },
  { id: "optimizer", label: "Optimizer" },
  { id: "rebalance", label: "Rebalance" },
]

export default function Layout({ activeTab, onTabChange, children }) {
  return (
    <div className="app">
      <header>
        <h1>Momentum Quant</h1>
        <p className="subtitle">NIFTY Momentum Scanner & Backtester</p>
      </header>
      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  )
}
