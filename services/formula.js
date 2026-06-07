// services/formula.js
//
// Parse and evaluate text scoring formulas like:
//   "6 Month Performance / 6 Month Volatility"
//   "(60% * 6 Month Performance + 30% * 3 Month Performance) / 3 Month Volatility"

const { getFactorNames } = require("./factors")

class FormulaError extends Error {
  constructor(message) {
    super(message)
    this.name = "FormulaError"
  }
}

/**
 * Parse a formula string into a compiled formula object.
 *
 * Returns {
 *   factors: string[],       // unique factor names used
 *   evaluate: (values) => number  // values = { "factor name": number }
 * }
 */
function parse(formulaText) {
  if (!formulaText || typeof formulaText !== "string") {
    throw new FormulaError("Formula cannot be empty")
  }

  const original = formulaText.trim()
  if (original.length === 0) {
    throw new FormulaError("Formula cannot be empty")
  }

  // Phase 1: Replace known factor names with placeholders.
  // Sort longest-first so "6 Month Performance" matches before "6 Month".
  const factorNames = getFactorNames()
  const usedFactors = []
  let expression = original.toLowerCase()

  for (const name of factorNames) {
    let idx = expression.indexOf(name)
    while (idx !== -1) {
      const placeholder = `__f${usedFactors.length}__`
      usedFactors.push(name)
      expression =
        expression.slice(0, idx) + placeholder + expression.slice(idx + name.length)
      idx = expression.indexOf(name)
    }
  }

  // Phase 2: Normalize percentage syntax. "60% *" -> "0.60 *"
  expression = expression.replace(/(\d+(?:\.\d+)?)\s*%\s*\*/g, (_, num) => {
    return `${(parseFloat(num) / 100).toString()} *`
  })

  // Validate: only allowed chars are digits, dots, placeholders, operators, parens, whitespace
  const cleaned = expression.replace(/__f\d+__/g, "0")
  if (!/^[\d\s.+\-*/()]+$/.test(cleaned)) {
    const badChar = cleaned.match(/[^\d\s.+\-*/()]/)
    throw new FormulaError(
      `Unexpected character '${badChar ? badChar[0] : "?"}' in formula. ` +
        `Known factors: ${factorNames.join(", ")}`
    )
  }

  // Deduplicate factors list
  const uniqueFactors = [...new Set(usedFactors)]

  // Build the evaluation expression template
  const exprTemplate = expression

  return {
    factors: uniqueFactors,
    original,
    evaluate(values) {
      let expr = exprTemplate
      for (let i = 0; i < usedFactors.length; i++) {
        const val = values[usedFactors[i]]
        if (val === undefined) {
          throw new FormulaError(`Missing factor value: ${usedFactors[i]}`)
        }
        expr = expr.replace(`__f${i}__`, String(val))
      }
      return evalExpr(expr)
    },
  }
}

// --- Recursive descent evaluator ---

function tokenize(expr) {
  const tokens = []
  let i = 0
  while (i < expr.length) {
    if (/\s/.test(expr[i])) {
      i++
      continue
    }
    if (/\d/.test(expr[i]) || (expr[i] === "." && i + 1 < expr.length && /\d/.test(expr[i + 1]))) {
      let num = ""
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === ".")) {
        num += expr[i++]
      }
      tokens.push({ type: "NUM", value: parseFloat(num) })
      continue
    }
    if (expr[i] === "-" && (tokens.length === 0 || tokens[tokens.length - 1].type === "OP" || tokens[tokens.length - 1].type === "LPAREN")) {
      let num = "-"
      i++
      while (i < expr.length && /\s/.test(expr[i])) i++
      if (i < expr.length && (/\d/.test(expr[i]) || expr[i] === ".")) {
        while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === ".")) {
          num += expr[i++]
        }
        tokens.push({ type: "NUM", value: parseFloat(num) })
      } else {
        tokens.push({ type: "UNARY_MINUS" })
      }
      continue
    }
    if ("+-*/".includes(expr[i])) {
      tokens.push({ type: "OP", value: expr[i] })
      i++
      continue
    }
    if (expr[i] === "(") {
      tokens.push({ type: "LPAREN" })
      i++
      continue
    }
    if (expr[i] === ")") {
      tokens.push({ type: "RPAREN" })
      i++
      continue
    }
    throw new FormulaError(`Unexpected character in expression: '${expr[i]}'`)
  }
  return tokens
}

function evalExpr(exprStr) {
  const tokens = tokenize(exprStr.trim())
  let pos = 0

  function peek() {
    return pos < tokens.length ? tokens[pos] : null
  }

  function consume() {
    return tokens[pos++]
  }

  function parseExpr() {
    let left = parseTerm()
    while (peek() && peek().type === "OP" && (peek().value === "+" || peek().value === "-")) {
      const op = consume().value
      const right = parseTerm()
      left = op === "+" ? left + right : left - right
    }
    return left
  }

  function parseTerm() {
    let left = parseUnary()
    while (peek() && peek().type === "OP" && (peek().value === "*" || peek().value === "/")) {
      const op = consume().value
      const right = parseUnary()
      if (op === "/") {
        // Division by zero: return +Infinity so the stock still ranks above those with negative scores
        left = right === 0 ? Infinity : left / right
      } else {
        left = left * right
      }
    }
    return left
  }

  function parseUnary() {
    if (peek() && peek().type === "UNARY_MINUS") {
      consume()
      return -parseUnary()
    }
    return parsePrimary()
  }

  function parsePrimary() {
    const tok = peek()
    if (!tok) throw new FormulaError("Unexpected end of expression")

    if (tok.type === "NUM") {
      consume()
      return tok.value
    }

    if (tok.type === "LPAREN") {
      consume()
      const val = parseExpr()
      const closing = consume()
      if (!closing || closing.type !== "RPAREN") {
        throw new FormulaError("Missing closing parenthesis")
      }
      return val
    }

    throw new FormulaError(`Unexpected token: ${JSON.stringify(tok)}`)
  }

  const result = parseExpr()

  if (pos < tokens.length) {
    throw new FormulaError(`Unexpected token after expression: ${JSON.stringify(tokens[pos])}`)
  }

  return isFinite(result) ? result : (result === Infinity ? 9999 : 0)
}

module.exports = { parse, FormulaError }
