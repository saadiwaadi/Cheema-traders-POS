import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { loginWithPin } from "../lib/posApi";


function Login() {
    
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setShowSplash(false);
    }, 2200);
  }, []);

  const login = useCallback(async (enteredPin) => {
    setLoading(true);
    setError("");

    try {
      const data = await loginWithPin(enteredPin);
      if (data?.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        navigate("/dashboard");
      } else {
        setError("Invalid PIN");

        setTimeout(() => {
          setPin("");
        }, 500);
      }
    } catch (err) {
      console.error(err);
      setError("Server error");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const handleClick = useCallback((num) => {
    if (pin.length < 4) {
      setError("");

      const newPin = pin + num;
      setPin(newPin);

      if (newPin.length === 4) {
        login(newPin);
      }
    }
  }, [pin, login]);

  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key >= "0" && e.key <= "9") handleClick(e.key);
      else if (e.key === "Backspace") handleDelete();
      else if (e.key === "Enter") login(pin);
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleClick, handleDelete, login, pin]);

  return (
    <div style={styles.container}>
      {/* 🌿 LIGHT GREEN BACKGROUND */}
      <div style={styles.bg}></div>

      <AnimatePresence>
        {showSplash ? (
          <motion.div
            style={styles.splash}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ color: "#2e7d32" }}
            >
              POS System
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              style={styles.name}
            >
              CHEEMA TRADERS
            </motion.h2>
          </motion.div>
        ) : (
          <motion.div
            style={styles.card}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 style={styles.title}>Cheema Traders</h2>
            <p style={styles.subtitle}>POS Login</p>

            {/* PIN DOTS */}
            <div style={styles.pinWrapper}>
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  style={{
                    ...styles.dot,
                    background: i < pin.length ? "#66bb6a" : "#c8e6c9",
                  }}
                  animate={{ scale: i < pin.length ? 1.2 : 1 }}
                />
              ))}
            </div>

            {error && <p style={styles.error}>{error}</p>}

            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1 }}
                style={styles.loader}
              />
            ) : (
              <div style={styles.keypad}>
                {[1,2,3,4,5,6,7,8,9].map(num => (
                  <KeyButton key={num} onClick={() => handleClick(num)}>
                    {num}
                  </KeyButton>
                ))}

                <KeyButton onClick={handleDelete}>⌫</KeyButton>

                <KeyButton onClick={() => handleClick(0)}>0</KeyButton>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  style={styles.loginBtn}
                  onClick={() => login(pin)}
                >
                  Enter
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* BUTTON */
const KeyButton = ({ children, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.9 }}
    whileHover={{ scale: 1.05 }}
    style={styles.btn}
    onClick={onClick}
  >
    {children}
  </motion.button>
);

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Segoe UI, sans-serif",
    position: "relative",
  },

  bg: {
    position: "absolute",
    width: "100%",
    height: "100%",
    background: "linear-gradient(135deg, #e8f5e9, #c8e6c9)",
    zIndex: -1,
  },

  splash: {
    textAlign: "center",
  },

  name: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#43a047",
  },

  card: {
    background: "#ffffff",
    padding: "35px",
    borderRadius: "16px",
    width: "300px",
    textAlign: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
  },

  title: {
    margin: 0,
    fontSize: "22px",
    fontWeight: "600",
    color: "#2e7d32",
  },

  subtitle: {
    fontSize: "13px",
    color: "#666",
    marginBottom: "20px",
  },

  pinWrapper: {
    display: "flex",
    justifyContent: "center",
    gap: "12px",
    margin: "20px 0",
  },

  dot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
  },

  error: {
    color: "red",
    fontSize: "12px",
  },

  keypad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 70px)",
    gap: "10px",
    justifyContent: "center",
    marginTop: "15px",
  },

  btn: {
    height: "55px",
    borderRadius: "10px",
    border: "1px solid #c8e6c9",
    background: "#f1f8f4",
    fontSize: "18px",
    cursor: "pointer",
  },

  loginBtn: {
    height: "55px",
    borderRadius: "10px",
    border: "none",
    background: "#66bb6a",
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer",
  },

  loader: {
    width: "40px",
    height: "40px",
    border: "4px solid #c8e6c9",
    borderTop: "4px solid #66bb6a",
    borderRadius: "50%",
    margin: "20px auto",
  },
};

export default Login;
