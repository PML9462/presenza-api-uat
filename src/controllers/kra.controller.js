const { ObjectId } = require("mongodb");
const { mobileKraService } = require("../services/index");

/**
 * Get all KRAs for the logged-in employee
 * Returns grouped by batch with employee-specific metrics
 */
const getMyKRAs = async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID not found",
      });
    }

    const result = await mobileKraService.getEmployeeKRAs(employeeId);

    return res.status(200).json({
      success: true,
      message: "KRAs fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get My KRAs Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

/**
 * Get a specific KRA by ID for the logged-in employee
 */
const getMyKRAById = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID not found",
      });
    }

    const result = await mobileKraService.getEmployeeKRAById(id, employeeId);

    return res.status(200).json({
      success: true,
      message: "KRA fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get My KRA By ID Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

/**
 * Update metrics (achieved values) for an employee's KRA
 */
const updateMyKRAMetrics = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user.employeeId;
    const { metrics } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID not found",
      });
    }

    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Metrics array is required",
      });
    }

    const result = await mobileKraService.updateEmployeeKRAMetrics(id, employeeId, metrics);

    return res.status(200).json({
      success: true,
      message: "KRA metrics updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update My KRA Metrics Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

/**
 * Update KRA status (pending, in-progress, completed, etc.)
 */
const updateMyKRAStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user.employeeId;
    const { status } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID not found",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const validStatuses = ['pending', 'in-progress', 'completed', 'reviewed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const result = await mobileKraService.updateEmployeeKRAStatus(id, employeeId, status);

    return res.status(200).json({
      success: true,
      message: "KRA status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update My KRA Status Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

/**
 * Get KRA dashboard summary for mobile
 */
const getKRADashboard = async (req, res) => {
  try {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID not found",
      });
    }

    const result = await mobileKraService.getKRADashboard(employeeId);

    return res.status(200).json({
      success: true,
      message: "Dashboard fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get KRA Dashboard Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

module.exports = {
  getMyKRAs,
  getMyKRAById,
  updateMyKRAMetrics,
  updateMyKRAStatus,
  getKRADashboard,
};