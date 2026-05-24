const store = require("../store");

/* ADD COMPANY */
exports.addCompany = async (req, res) => {
  try {
    const supplier = await store.saveSupplier(req.body);
    res.status(201).json({
      message: "Company added successfully",
      company: {
        _id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        salesOfficerPhone: supplier.salesOfficerPhone,
        address: supplier.address,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/* GET COMPANIES */
exports.getCompanies = async (_req, res) => {
  try {
    const suppliers = await store.listSuppliers("");
    const formatted = suppliers.map((supplier) => ({
      _id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      salesOfficerPhone: supplier.salesOfficerPhone,
      address: supplier.address,
    }));
    res.json({ companies: formatted });
  } catch (error) {
    res.status(500).json({ message: "Error fetching companies" });
  }
};

/* DELETE COMPANY */
exports.deleteCompany = async (req, res) => {
  try {
    await store.softDeleteSupplier(req.params.id);
    res.json({ message: "Company deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting company" });
  }
};
