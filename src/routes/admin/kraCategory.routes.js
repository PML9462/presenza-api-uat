const express = require("express");
const router = express.Router();
const auth = require('../../middlewares/admin/auth');

const { kraCategoryController } = require("../../controllers/admin/index");




router.post("/", auth(), kraCategoryController.createCategory);

router.get("/", kraCategoryController.getAllCategories);

router.get("/:id", auth(), kraCategoryController.getCategoryById);

router.put("/:id", auth(), kraCategoryController.updateCategory);

router.patch("/:id/status", auth(), kraCategoryController.toggleCategoryStatus);

router.delete("/:id", auth(), kraCategoryController.deleteCategory);

module.exports = router;