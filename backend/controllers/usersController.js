const store = require("../store");

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await store.loginUser(username, password);
    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const users = await store.listUsers();
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.listActiveUsers = async (req, res) => {
  try {
    const users = await store.listActiveUsers();
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.saveUser = async (req, res) => {
  try {
    const user = await store.saveUser(req.body);
    return res.json({ user });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    const result = await store.changePassword(userId, oldPassword, newPassword);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};