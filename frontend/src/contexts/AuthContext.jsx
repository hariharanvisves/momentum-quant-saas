import { createContext, useContext, useState, useEffect } from "react"
import { api } from "../api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = api.getAuthToken()
    if (token) {
      api.getMe()
        .then((data) => setUser(data.user))
        .catch((err) => {
          // Only clear session on explicit 401 (token expired/invalid)
          // Network errors, 500s etc should not log out the user
          if (err.status === 401 || err.message?.includes("401") || err.message?.includes("Authentication")) {
            api.setAuthToken(null)
          }
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(email, password) {
    const data = await api.login(email, password)
    api.setAuthToken(data.token)
    setUser(data.user)
    return data
  }

  async function register(email, password) {
    const data = await api.register(email, password)
    api.setAuthToken(data.token)
    setUser(data.user)
    return data
  }

  async function logout() {
    try { await api.logout() } catch (e) { /* ignore */ }
    api.setAuthToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
