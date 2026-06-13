const express = require("express");
const router = express.Router();

const {
  loginUser,
  listUsers,
  listActiveUsers,
  saveUser,
  changePassword,
} = require("../controllers/usersController");

router.post("/login", loginUser);
router.get("/", listUsers);
router.get("/active", listActiveUsers);
router.post("/", saveUser);
router.post("/change-password", changePassword);

module.exports = router;