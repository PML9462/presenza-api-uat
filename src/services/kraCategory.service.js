const { KRACategory } = require("../models/index");

exports.createCategory = async (payload, user) => {
    console.log("Payload:", payload);
    console.log("User:", user);
    const exists = await KRACategory.findOne({
        categoryName: payload.categoryName.trim(),
    });

    if (exists) {
        throw new Error("Category already exists.");
    }

    return KRACategory.create({
        ...payload,
        createdBy: user.employeeId,
    });
};

exports.getAllCategories = async () => {
    return KRACategory.find()
        .sort({
            displayOrder: 1,
            categoryName: 1,
        })
        .lean();
};

exports.getCategoryById = async (id) => {
    const category = await KRACategory.findById(id);

    if (!category) {
        throw new Error("Category not found.");
    }

    return category;
};

exports.updateCategory = async (id, payload, user) => {
    const category = await KRACategory.findById(id);

    if (!category) {
        throw new Error("Category not found.");
    }

    if (
        payload.categoryName &&
        payload.categoryName !== category.categoryName
    ) {
        const duplicate = await KRACategory.findOne({
            categoryName: payload.categoryName,
            _id: { $ne: id },
        });

        if (duplicate) {
            throw new Error("Category already exists.");
        }
    }

    Object.assign(category, payload);

    category.updatedBy = user._id;

    await category.save();

    return category;
};

exports.toggleCategoryStatus = async (id, user) => {
    const category = await KRACategory.findById(id);

    if (!category) {
        throw new Error("Category not found.");
    }

    category.isActive = !category.isActive;
    category.updatedBy = user._id;

    await category.save();

    return category;
};

exports.deleteCategory = async (id) => {
    const category = await KRACategory.findById(id);

    if (!category) {
        throw new Error("Category not found.");
    }

    // Optional:
    // Check if category is used in any KRA before deleting.

    await category.deleteOne();

    return true;
};