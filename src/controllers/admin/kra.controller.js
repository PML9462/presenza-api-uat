const { ObjectId } = require("mongodb");
const { kraService, employeeService } = require("../../services/index");

const createKRA = async (req, res) => {
  try {
    const data = req.body;

    if (!data.employees || data.employees.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one employee with metrics is required",
      });
    }

    const result = await kraService.createKRAForEmployees(data);

    return res.status(201).json({
      success: true,
      message: `KRA created for ${result.length} employees`,
      data: result,
    });
  } catch (error) {
    console.error("KRA Creation Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const getAllKRA = async (req, res) => {
  try {
    const filterQuery = {};
    const employeeMatchQuery = {};
    
    if (req.user.role === 'MANAGER') {
      employeeMatchQuery["reportingTo"] = new ObjectId(req.user.employeeId);
      const employees = await employeeService.getEmployees(employeeMatchQuery);
      const employeeIds = employees.map(emp => emp._id.toString());
      filterQuery.employeeId = { $in: employeeIds };
    }
    
    const result = await kraService.getAllKRA(filterQuery);

    return res.status(200).json({
      success: true,
      message: `KRA fetched successfully`,
      data: result,
    });
  } catch (error) {
    console.error("KRA Fetching Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const getKRAbyBatchId = async (req, res) => {
  try {
    const { batchId } = req.params;
    
    const result = await kraService.getKRAByBatchId(batchId);

    return res.status(200).json({
      success: true,
      message: "Batch KRAs fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get Batch KRAs Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const deleteKRA = async (req, res) => {
  try {
    const { id } = req.params;

    await kraService.deleteKRA(id);

    return res.status(200).json({
      success: true,
      message: `KRA batch deleted successfully`,
    });
  } catch (error) {
    console.error("KRA Deletion Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const deleteIndividualKRA = async (req, res) => {
  try {
    const { id } = req.params;

    await kraService.deleteIndividualKRA(id);

    return res.status(200).json({
      success: true,
      message: `KRA deleted successfully`,
    });
  } catch (error) {
    console.error("KRA Deletion Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const updateIndividualKRA = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const result = await kraService.updateIndividualKRA(id, data);

    return res.status(200).json({
      success: true,
      message: "KRA updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update Individual KRA Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

module.exports = {
  createKRA,
  getAllKRA,
  getKRAbyBatchId,
  deleteKRA,
  deleteIndividualKRA,
  updateIndividualKRA,
};