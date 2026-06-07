const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const db = require("../db")

const JWT_SECRET = process.env.JWT_SECRET || "momentum-quant-dev-secret-change-in-prod"
const TOKEN_EXPIRY = "7d"
const SALT_ROUNDS = 10

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_SESSIONS_PER_USER = 5

/** Creates an error that handle() will pass through to the client with the given HTTP status. */
function appError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

async function register(email, password) {
  if (!email || !password) throw appError("Email and password required")
  if (!EMAIL_RE.test(email)) throw appError("Invalid email format")
  if (password.length < 6) throw appError("Password must be at least 6 characters")

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase())
  if (existing) throw appError("Email already registered", 409)

  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  const result = db.prepare(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)"
  ).run(email.toLowerCase(), hash)

  const user = db.prepare("SELECT id, email, plan, created_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid)
  const token = generateToken(user)
  saveSession(user.id, token)

  return { user, token }
}

async function login(email, password) {
  if (!email || !password) throw appError("Email and password required")

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase())
  if (!user) throw appError("Invalid email or password", 401)

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) throw appError("Invalid email or password", 401)

  const token = generateToken({ id: user.id, email: user.email, plan: user.plan })
  saveSession(user.id, token)

  return {
    user: { id: user.id, email: user.email, plan: user.plan, created_at: user.created_at },
    token,
  }
}

function generateToken(user) {
  return jwt.sign(
    // jti (JWT ID) ensures every token is cryptographically unique even if
    // issued within the same second for the same user — prevents UNIQUE
    // constraint failures on the sessions table.
    { userId: user.id, email: user.email, plan: user.plan, jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  )
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (e) {
    return null
  }
}

function saveSession(userId, token) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  // Prune expired sessions
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime('now')").run(userId)
  // Enforce per-user session cap — evict oldest beyond limit
  const active = db.prepare("SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at ASC").all(userId)
  if (active.length >= MAX_SESSIONS_PER_USER) {
    const evict = active.slice(0, active.length - MAX_SESSIONS_PER_USER + 1)
    db.prepare(`DELETE FROM sessions WHERE id IN (${evict.map(() => "?").join(",")})`).run(...evict.map(s => s.id))
  }
  db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").run(userId, token, expiresAt)
}

function getUser(userId) {
  return db.prepare("SELECT id, email, plan, created_at FROM users WHERE id = ?").get(userId)
}

function invalidateSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token)
}

async function forgotPassword(email) {
  if (!email) throw appError("Email is required")
  if (!EMAIL_RE.test(email)) throw appError("Invalid email format")

  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase())
  // Always return success to avoid revealing whether an email is registered
  if (!user) {
    return { message: "If that email is registered, a reset token has been generated." }
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  // Invalidate any existing tokens for this user
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(user.id)
  db.prepare(
    "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)"
  ).run(user.id, token, expiresAt)

  // In production: send email. Token returned in response for dev only.
  return {
    message: "Reset token generated. Use it to set a new password.",
    token, // In production this would be emailed, not returned here
    expiresIn: "1 hour",
  }
}

async function resetPassword(token, newPassword) {
  if (!token) throw appError("Reset token is required")
  if (!newPassword || newPassword.length < 6) throw appError("Password must be at least 6 characters")

  const record = db.prepare(
    "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')"
  ).get(token)
  if (!record) throw appError("Invalid or expired reset token", 401)

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, record.user_id)
  db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE token = ?").run(token)

  // Invalidate all sessions so any existing logins are forced out
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(record.user_id)

  return { message: "Password reset successfully. Please log in with your new password." }
}

module.exports = { register, login, verifyToken, getUser, invalidateSession, forgotPassword, resetPassword }
