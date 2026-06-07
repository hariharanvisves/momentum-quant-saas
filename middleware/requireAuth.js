const { verifyToken, getUser } = require("../services/auth")
const db = require("../db")

function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" })
  }

  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }

  // Verify session still exists in DB (handles logout/revocation)
  const session = db.prepare(
    "SELECT id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
  ).get(token)
  if (!session) {
    return res.status(401).json({ error: "Session expired or revoked" })
  }

  const user = getUser(payload.userId)
  if (!user) {
    return res.status(401).json({ error: "User not found" })
  }

  req.user = user
  req.token = token
  next()
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7)
    const payload = verifyToken(token)
    if (payload) {
      req.user = getUser(payload.userId)
      req.token = token
    }
  }
  next()
}

module.exports = { requireAuth, optionalAuth }
