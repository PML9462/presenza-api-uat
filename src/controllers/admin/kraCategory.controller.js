const { kraCategoryService } = require("../../services/index");

exports.createCategory = async (req, res, next) => {
    try {
        
        const result = await kraCategoryService.createCategory(req.body, req.user);

        res.status(201).json({
            success: true,
            message: "KRA Category created successfully.",
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

exports.getAllCategories = async (req, res, next) => {
    try {
        const result = await kraCategoryService.getAllCategories(req.query);

        res.json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

exports.getCategoryById = async (req, res, next) => {
    try {
        const result = await kraCategoryService.getCategoryById(req.params.id);

        res.json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

exports.updateCategory = async (req, res, next) => {
    try {
        const result = await kraCategoryService.updateCategory(
            req.params.id,
            req.body,
            req.user
        );

        res.json({
            success: true,
            message: "Category updated successfully.",
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

exports.toggleCategoryStatus = async (req, res, next) => {
    try {
        const result = await kraCategoryService.toggleCategoryStatus(
            req.params.id,
            req.user
        );

        res.json({
            success: true,
            message: "Status updated successfully.",
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteCategory = async (req, res, next) => {
    try {
        await kraCategoryService.deleteCategory(req.params.id);

        res.json({
            success: true,
            message: "Category deleted successfully.",
        });
    } catch (err) {
        next(err);
    }
};