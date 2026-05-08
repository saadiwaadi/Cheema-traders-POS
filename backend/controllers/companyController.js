const db = require("../db");

/* ADD COMPANY */
exports.addCompany = (req, res) => {
  const { name, phone, salesOfficerPhone, address } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Company name is required" });
  }

  const query = `
    INSERT INTO companies (name, phone, sales_officer_phone, address)
    VALUES (?, ?, ?, ?)
  `;

  db.run(query, [name, phone, salesOfficerPhone, address], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Error adding company" });
    }

    res.status(201).json({
      message: "Company added successfully",
      company: {
        _id: this.lastID,
        name,
        phone,
        salesOfficerPhone,
        address
      }
    });
  });
};

/* GET COMPANIES */
exports.getCompanies = (req, res) => {
  db.all(`SELECT * FROM companies ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching companies" });
    }

    const formatted = rows.map((c) => ({
      _id: c.id,
      name: c.name,
      phone: c.phone,
      salesOfficerPhone: c.sales_officer_phone,
      address: c.address
    }));

    res.json({ companies: formatted });
  });
};

/* DELETE COMPANY */
exports.deleteCompany = (req, res) => {
  const { id } = req.params;

  db.run(`DELETE FROM companies WHERE id = ?`, [id], function (err) {
    if (err) {
      return res.status(500).json({ message: "Error deleting company" });
    }

    res.json({ message: "Company deleted successfully" });
  });
};