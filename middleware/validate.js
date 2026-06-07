// Validation middleware helpers

function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

function validateBody(schema) {
  return (req, res, next) => {
    for (const [field, rule] of Object.entries(schema)) {
      const val = req.body[field]
      if (val === undefined || val === null || val === "") {
        if (rule.required) return res.status(400).json({ error: `${field} is required` })
        continue
      }
      if (rule.type === "string") {
        if (typeof val !== "string") return res.status(400).json({ error: `${field} must be a string` })
        if (rule.maxLength && val.length > rule.maxLength) return res.status(400).json({ error: `${field} max length is ${rule.maxLength}` })
        if (rule.minLength && val.length < rule.minLength) return res.status(400).json({ error: `${field} min length is ${rule.minLength}` })
        if (rule.isDate && !isValidDate(val)) return res.status(400).json({ error: `${field} must be a valid date (YYYY-MM-DD)` })
      }
      if (rule.type === "number") {
        const n = Number(val)
        if (isNaN(n)) return res.status(400).json({ error: `${field} must be a number` })
        if (rule.min !== undefined && n < rule.min) return res.status(400).json({ error: `${field} min is ${rule.min}` })
        if (rule.max !== undefined && n > rule.max) return res.status(400).json({ error: `${field} max is ${rule.max}` })
      }
    }
    next()
  }
}

const validateScoring = validateBody({
  formula: { type: "string", maxLength: 500 },
})

const validateBacktest = validateBody({
  startDate: { type: "string", isDate: true },
  endDate: { type: "string", isDate: true },
  topN: { type: "number", min: 1, max: 50 },
  symbolLimit: { type: "number", min: 1, max: 500 },
  rebalanceFrequency: { type: "number", min: 1, max: 252 },
  initialCapital: { type: "number", min: 1000 },
})

const validateStrategy = validateBody({
  name: { type: "string", required: true, maxLength: 100, minLength: 1 },
  formula: { type: "string", required: true, maxLength: 500, minLength: 1 },
  description: { type: "string", maxLength: 500 },
})

module.exports = { validateScoring, validateBacktest, validateStrategy }
