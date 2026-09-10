const {ObjectId} = require('mongodb')
const { designationService } = require('../../services/index');

const createDesignation = async (req, res) => {
    try {
        const { title, level, department } = req.body;
        const designation = await designationService.createDesignation({
            title,
            level,
            department
        });
        return res.status(200).json({
            success: true,
            message: "Designation created successfully",
            data: designation
        })
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const getDesignations = async (req, res) => {
    try {

        const { departmentId } = req.query;

        let filterQuery = {};
        if (departmentId) {
            filterQuery["department"] = new ObjectId(departmentId)
        }

        const designations = await designationService.getDesignations(filterQuery);
        return res.status(200).json({
            success: true,
            message: "Designations retrieved successfully",
            data: designations
        })
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    createDesignation,
    getDesignations
}