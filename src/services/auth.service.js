const bcrypt = require('bcrypt');
const employeeService = require('./employee.service');
const deviceService = require('./device.service');
const otpService = require('./otp.service');
const jwtService = require('./jwt.service');

// Optional: Add test employee constant for logging
const TEST_EMPLOYEE_CODE = 'F142626';

exports.sendOtp = async ({ employeeCode }) => {
  /* ---------- 1. Employee must exist ---------- */
  const employee = await employeeService.getEmployeeByCode(employeeCode);

  if (!employee) {
    const error = new Error(
      "Employee not found. Please contact HR or Admin."
    );
    error.statusCode = 404;
    throw error;
  }

  /* ---------- 2. Employee must be active ---------- */
  if (!employee.isActive) {
    const error = new Error(
      "Your account is inactive. Please contact HR."
    );
    error.statusCode = 403;
    throw error;
  }

  /* ---------- Optional: Log test employee usage ---------- */
  if (employeeCode === TEST_EMPLOYEE_CODE && process.env.NODE_ENV !== 'production') {
  }

  /* ---------- 3. Generate OTP ---------- */
  await otpService.generateOtp(employee.email, employeeCode);

  /* ---------- 4. Update auth step ---------- */
  await employeeService.updateAuthStep(
    employee._id,
    "VERIFY_OTP"
  );

  return {
    email: employee.email,
    employeeCode: employee.employeeCode,
    step: "VERIFY_OTP",
  };
};

exports.verifyOtp = async ({ employeeCode, otp, deviceInfo }) => {
  // Verify OTP (test employee logic is inside otpService)
  await otpService.verifyOtp(employeeCode, otp);

  // Get employee
  const employee = await employeeService.getEmployeeByCode(employeeCode);

  if (!employee) {
    throw new Error('Employee not found');
  }

  /* ---------- Optional: Log test employee verification ---------- */
  if (employeeCode === TEST_EMPLOYEE_CODE && process.env.NODE_ENV !== 'production') {
  }

  // Generate JWT tokens
  const tokens = await jwtService.generateAuthTokens(employee);

  // Update employee status
  await employeeService.updateAuthStep(employee._id, 'AUTHENTICATED');
  await employeeService.updateLastLogin(employee._id);
  await employeeService.saveRefreshToken(employee._id, tokens.refresh.token);

  // Register/update device if device info is provided
  if (deviceInfo && deviceInfo.deviceId) {
    console.log(`Registering/updating device for employee ${employeeCode}:`, deviceInfo);
    await deviceService.registerOrUpdateDevice({
      employeeId: employee._id,
      deviceId: deviceInfo.deviceId,
      platform: deviceInfo.platform,
      appVersion: deviceInfo.appVersion,
      osVersion: deviceInfo.osVersion,
      isTrusted: true, // Auto-trust after OTP verification
      fcmToken: deviceInfo.fcmToken,
    });
  }

  // Return user data
  const userData = {
    id: employee._id,
    email: employee.email,
    fullName: employee.fullName,
    role: employee.role,
    department: employee.department,
    designation: employee.designation,
    isEmailVerified: employee.isEmailVerified,
    isActive: employee.isActive,
  };

  return {
    tokens,
    user: userData,
    step: 'AUTHENTICATED',
  };
};

// ... rest of the file remains exactly the same ...

exports.refreshTokens = async (refreshToken) => {
  // Verify refresh token
  const payload = await jwtService.verifyToken(refreshToken, 'refresh');

  // Validate token against stored token
  const isValid = await employeeService.validateRefreshToken(payload.sub, refreshToken);

  if (!isValid) {
    throw new Error('Invalid refresh token');
  }

  // Get employee
  const employee = await employeeService.getEmployeeById(payload.sub);

  if (!employee) {
    throw new Error('Employee not found');
  }

  // Generate new tokens
  const tokens = await jwtService.generateAuthTokens(employee);

  // Update stored refresh token
  await employeeService.saveRefreshToken(employee._id, tokens.refresh.token);

  return tokens;
};

exports.logout = async (employeeId, deviceId) => {
  // Clear refresh token
  await employeeService.clearRefreshToken(employeeId);

  // Remove device if deviceId is provided
  if (deviceId) {
    await deviceService.removeDevice(employeeId, deviceId);
  }
};

exports.logoutAllDevices = async (employeeId) => {
  // Clear refresh token
  await employeeService.clearRefreshToken(employeeId);

  // Remove all devices
  await deviceService.removeAllDevices(employeeId);
};

exports.getCurrentUser = async (employeeId) => {
  const employee = await employeeService.getEmployeeById(employeeId);

  if (!employee) {
    return null;
  }

  return {
    id: employee._id,
    email: employee.email,
    fullName: employee.fullName,
    role: employee.role,
    department: employee.department,
    designation: employee.designation,
    isEmailVerified: employee.isEmailVerified,
    isActive: employee.isActive,
    lastLoginAt: employee.lastLoginAt,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
};


exports.login = async ({ email, password }) => {
  // Find employee by email
  const employee = await employeeService.getEmployeeByEmail(email);

  if (!employee) {
    throw new Error('Invalid email or password');
  }

  // Check if employee is active
  if (!employee.isActive) {
    throw new Error('Your account is inactive. Please contact HR.');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, employee.password);

  if (!isPasswordValid) {
    throw new Error('Invalid email or password');
  }

  // Generate JWT tokens
  const tokens = await jwtService.generateAuthTokens(employee);

  // Update employee status and last login
  await employeeService.updateAuthStep(employee._id, 'AUTHENTICATED');
  await employeeService.updateLastLogin(employee._id);
  await employeeService.saveRefreshToken(employee._id, tokens.refresh.token);



  return {
    tokens,
    employee
  };
}