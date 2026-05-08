const express = require("express");
const router = express.Router();
const companyController = require("../controllers/companyController");

router.post("/add", companyController.addCompany);
router.get("/list", companyController.getCompanies);
router.delete("/:id", companyController.deleteCompany);

module.exports = router;