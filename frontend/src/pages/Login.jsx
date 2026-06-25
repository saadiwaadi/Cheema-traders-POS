import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { login, listActiveUsers } from "../lib/posApi";

function Login() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isCustomUser, setIsCustomUser] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [businessName, setBusinessName] = useState("Cheema Traders");

  useEffect(() => {
    if (window.ipc) {
      window.ipc.invoke("pos:settings:get").then(res => {
        if (res && res.business_name) {
          setBusinessName(res.business_name);
        }
      }).catch(e => console.error("Failed to load business name on login page", e));
    }
  }, []);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2200);

    const checkUsers = async () => {
      try {
        const data = await listActiveUsers();
        if (data?.users) {
          setUsers(data.users);
          if (data.users.length > 0) {
            setUsername(data.users[0].username);
          } else {
            setIsCustomUser(true);
          }
        } else {
          setIsCustomUser(true);
        }
      } catch (err) {
        console.error("Failed to load startup info:", err);
        setIsCustomUser(true);
      }
    };
    checkUsers();

    return () => clearTimeout(splashTimer);
  }, []);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter both username and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await login(username.trim(), password);
      if (data?.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        navigate("/dashboard");
      } else {
        setError("Invalid username or password");
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* 🌿 LIGHT GREEN GRADIENT BACKGROUND */}
      <div style={styles.bg}></div>

      <AnimatePresence mode="wait">
        {showSplash ? (
          <motion.div
            key="splash"
            style={styles.splash}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={styles.splashTitle}
            >
              POS System
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              style={styles.splashSubtitle}
            >
              {businessName.toUpperCase()}
            </motion.h2>
          </motion.div>
        ) : (
          <motion.div
            key="login-card"
            style={styles.card}
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
          >
            <div style={styles.header}>
              <h2 style={styles.title}>{businessName}</h2>
              <p style={styles.subtitle}>Sign in to your account</p>
            </div>

            <form onSubmit={handleLogin} style={styles.form}>
              <div style={styles.inputGroup}>
                <div style={styles.labelRow}>
                  <label style={styles.label}>Username</label>
                  {users.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomUser(!isCustomUser);
                        if (isCustomUser && users.length > 0) {
                          setUsername(users[0].username);
                        } else {
                          setUsername("");
                        }
                      }}
                      style={styles.toggleBtn}
                    >
                      {isCustomUser ? "Select from list" : "Type instead"}
                    </button>
                  )}
                </div>

                {isCustomUser ? (
                  <input
                    type="text"
                    placeholder="Enter Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={styles.input}
                    required
                  />
                ) : (
                  <select
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={styles.select}
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.username}>
                        {u.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={styles.error}
                >
                  {error}
                </motion.p>
              )}

              <motion.button
                whileHover={{ scale: 1.02, backgroundColor: "#388e3c" }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                style={styles.loginBtn}
                disabled={loading}
              >
                {loading ? (
                  <span style={styles.loaderText}>Logging in...</span>
                ) : (
                  "Login"
                )}
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  bg: {
    position: "absolute",
    width: "100%",
    height: "100%",
    background: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)",
    zIndex: -1,
  },
  splash: {
    textAlign: "center",
  },
  splashTitle: {
    fontSize: "42px",
    fontWeight: "800",
    color: "#1b5e20",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  splashSubtitle: {
    fontSize: "24px",
    fontWeight: "500",
    color: "#43a047",
    margin: "10px 0 0 0",
    letterSpacing: "2px",
  },
  card: {
    background: "#ffffff",
    padding: "40px",
    borderRadius: "24px",
    width: "360px",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.8)",
  },
  header: {
    textAlign: "center",
    marginBottom: "32px",
  },
  title: {
    margin: 0,
    fontSize: "26px",
    fontWeight: "700",
    color: "#1b5e20",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666666",
    margin: "8px 0 0 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  labelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#2e7d32",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    color: "#43a047",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    padding: 0,
    outline: "none",
    textDecoration: "underline",
  },
  input: {
    height: "46px",
    padding: "0 16px",
    borderRadius: "12px",
    border: "1.5px solid #e0e0e0",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    background: "#fafafa",
    color: "#333",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    height: "46px",
    padding: "0 12px",
    borderRadius: "12px",
    border: "1.5px solid #e0e0e0",
    fontSize: "15px",
    outline: "none",
    background: "#fafafa",
    color: "#333",
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  error: {
    color: "#d32f2f",
    fontSize: "13px",
    margin: 0,
    textAlign: "center",
    fontWeight: "500",
  },
  loginBtn: {
    height: "48px",
    borderRadius: "12px",
    border: "none",
    background: "#43a047",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(67, 160, 71, 0.2)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    marginTop: "8px",
  },
  loaderText: {
    opacity: 0.8,
  },
};

export default Login;
