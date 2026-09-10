const mongoose = require('mongoose');
const Device = require('../models/device.model');

const registerOrUpdateDevice = async (data) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      employeeId,
      deviceId,
      platform,
      appVersion,
      osVersion,
      isTrusted = true,
      fcmToken,
    } = data;

    // Existing device with this deviceId
    const existingDevice = await Device.findOne({ deviceId }).session(session);

    // Existing device assigned to this employee
    const employeeDevice = await Device.findOne({
      employee: employeeId,
    }).session(session);

    /**
     * -------------------------------------------------
     * CASE 1
     * Same employee + same device
     * Just update details.
     * -------------------------------------------------
     */
    if (
      existingDevice &&
      existingDevice.employee.equals(employeeId)
    ) {
      console.log(`Updating device ${deviceId} for employee ${employeeId}`);
      const updatedDevice = await Device.findByIdAndUpdate(
        existingDevice._id,
        {
          platform,
          appVersion,
          osVersion,
          isTrusted,
          fcmToken,
          lastUsedAt: new Date(),
        },
        {
          new: true,
          session,
        }
      );

      await session.commitTransaction();
      return updatedDevice;
    }

    /**
     * -------------------------------------------------
     * CASE 2
     * Employee changed device.
     * Delete previous employee device.
     * -------------------------------------------------
     */
    if (
      employeeDevice &&
      employeeDevice.deviceId !== deviceId
    ) {
      console.log(`Employee ${employeeId} changed device from ${employeeDevice.deviceId} to ${deviceId}. Deleting old device.`);
      await Device.deleteOne(
        { _id: employeeDevice._id },
        { session }
      );
    }

    /**
     * -------------------------------------------------
     * CASE 3
     * Device belongs to another employee.
     * Transfer ownership.
     * -------------------------------------------------
     */
    if (existingDevice) {

      console.log(`Transferring device ${deviceId} from employee ${existingDevice.employee} to employee ${employeeId}`);
      existingDevice.employee = employeeId;
      existingDevice.platform = platform;
      existingDevice.appVersion = appVersion;
      existingDevice.osVersion = osVersion;
      existingDevice.isTrusted = isTrusted;
      existingDevice.fcmToken = fcmToken;
      existingDevice.lastUsedAt = new Date();

      await existingDevice.save({ session });

      await session.commitTransaction();
      return existingDevice;
    }

    /**
     * -------------------------------------------------
     * CASE 4
     * Brand new employee + brand new device.
     * -------------------------------------------------
     */
    const newDevice = await Device.create(
      [
        {
          employee: employeeId,
          deviceId,
          platform,
          appVersion,
          osVersion,
          isTrusted,
          fcmToken,
          lastUsedAt: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return newDevice[0];
  } catch (error) {
    console.error('Error in registerOrUpdateDevice:', error);
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/* -------------------- Mark Device Used -------------------- */
const markDeviceUsed = async (employeeId, deviceId) => {
  return Device.findOneAndUpdate(
    {
      employee: employeeId,
      deviceId,
    },
    { lastUsedAt: new Date() },
    { new: true }
  );
};

/* -------------------- Check Trusted Device -------------------- */
const isDeviceTrusted = async (employeeId, deviceId) => {
  const device = await Device.findOne({
    employee: employeeId,
    deviceId,
    isTrusted: true,
  });

  return !!device;
};

/* -------------------- Get Employee Devices -------------------- */
const getEmployeeDevices = async (employeeId) => {
  return Device.find({ employee: employeeId })
    .sort({ lastUsedAt: -1 })
    .select('-__v');
};

/* -------------------- Remove Device -------------------- */
const removeDevice = async (employeeId, deviceId) => {
  return Device.findOneAndDelete({
    employee: employeeId,
    deviceId,
  });
};

/* -------------------- Remove All Devices -------------------- */
const removeAllDevices = async (employeeId) => {
  return Device.deleteMany({ employee: employeeId });
};

/* -------------------- Untrust Device -------------------- */
const untrustDevice = async (employeeId, deviceId) => {
  return Device.findOneAndUpdate(
    {
      employee: employeeId,
      deviceId,
    },
    { isTrusted: false },
    { new: true }
  );
};

/* -------------------- Trust Device -------------------- */
const trustDevice = async (employeeId, deviceId) => {
  return Device.findOneAndUpdate(
    {
      employee: employeeId,
      deviceId,
    },
    { isTrusted: true },
    { new: true }
  );
};

module.exports = {
  registerOrUpdateDevice,
  markDeviceUsed,
  isDeviceTrusted,
  getEmployeeDevices,
  removeDevice,
  removeAllDevices,
  untrustDevice,
  trustDevice,
};