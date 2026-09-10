const {ObjectId} = require('mongodb');
const { departmentService } = require('../../services/index');
const createDepartment = async (req, res) => {
    const department = await departmentService.createDepartment(req.body);
    return res.status(200).json({
        success: true,
        message: "Department created successfully",
        data: department
    })
}
const getDepartments = async (req, res) => {
    const filterQuery = {};
    if(req.user.role == "MANAGER"){
        filterQuery['_id'] = new ObjectId(req.user.department);
    }
    const departments = await departmentService.getDepartments(filterQuery);
    return res.status(200).json({
        success: true,
        message: "Departments retrieved successfully",
        data: departments
    })
}

module.exports = {
    createDepartment,
    getDepartments
}