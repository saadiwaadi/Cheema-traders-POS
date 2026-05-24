const db = require("../db");

exports.loginUser = (req, res) => {
  const { pin } = req.body;

  db.get(
    "SELECT * FROM users WHERE pin = ?",
    [pin],
    (err, user) => {
      if (err) return res.status(500).json(err);

      if (!user) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      res.json({
        message: "Login successful",
        user: {
          id: user.id,
          role: user.role,
        },
      });
    }
  );
};