const jwt = require("jsonwebtoken");
const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { employeeService, deviceService } = require("../../services");

const auth = () =>
  catchAsync(async (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(httpStatus.status.UNAUTHORIZED).json({
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      if (payload.type !== "access") {
        return res.status(httpStatus.status.UNAUTHORIZED).json({
          message: "Invalid token type",
        });
      }

      const employee = await employeeService.getEmployeeById(payload.sub);

      if (!employee || !employee.isActive) {
        return res.status(httpStatus.status.UNAUTHORIZED).json({
          message: "User not found or inactive",
        });
      }

      if (!employee.refreshToken) {
        return res.status(httpStatus.status.UNAUTHORIZED).json({
          message: "Session expired. Please login again.",
          code: "SESSION_LOGGED_OUT",
        });
      }

    //   const deviceId = req.headers["x-device-id"];

    //   if (deviceId) {
    //     const isDeviceTrusted = await deviceService.isDeviceTrusted(
    //       employee._id,
    //       deviceId
    //     );

    //     if (!isDeviceTrusted) {
    //       return res.status(httpStatus.status.UNAUTHORIZED).json({
    //         message: "Untrusted device. Please login again.",
    //       });
    //     }
    //   }

      req.user = {
        employeeId: employee._id,
        email: employee.email,
        role: employee.role,
        department: employee.department,
      };

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(httpStatus.status.UNAUTHORIZED).json({
          message: "Token expired",
          code: "TOKEN_EXPIRED",
        });
      }

      return res.status(httpStatus.status.UNAUTHORIZED).json({
        message: "Invalid token",
      });
    }
  });

module.exports = auth;