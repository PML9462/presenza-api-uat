const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const { KRA, Employee, Department } = require("../models/index");

/**
 * Create KRAs for multiple employees with employee-specific metrics
 */
const createKRAForEmployees = async (payload) => {
  const {
    title,
    description,
    departmentId,
    period,
    employees,
    startDate,
    endDate,
  } = payload;

  if (!employees || employees.length === 0) {
    throw new Error("At least one employee with metrics is required");
  }

  const department = await Department.findById(departmentId);
  if (!department) {
    throw new Error("Department not found");
  }

  const batchId = uuidv4();

  const employeeIds = employees.map(e => e.employeeId);
  const employeeDocs = await Employee.find({
    _id: { $in: employeeIds },
  }).select("_id reportingManager fullName departmentId");

  const foundIds = employeeDocs.map(doc => doc._id.toString());
  const notFound = employeeIds.filter(id => !foundIds.includes(id));
  if (notFound.length > 0) {
    throw new Error(`Employees not found: ${notFound.join(', ')}`);
  }

  for (const empData of employees) {
    if (!empData.metrics || empData.metrics.length === 0) {
      const employee = employeeDocs.find(e => e._id.toString() === empData.employeeId);
      throw new Error(`No metrics provided for ${employee?.fullName || 'employee'}`);
    }

    const totalWeight = empData.metrics.reduce((sum, m) => sum + (parseFloat(m.weightage) || 0), 0);
    if (totalWeight !== 100) {
      const employee = employeeDocs.find(e => e._id.toString() === empData.employeeId);
      throw new Error(`Total weightage for ${employee?.fullName || 'employee'} must be 100% (currently ${totalWeight}%)`);
    }

    for (const metric of empData.metrics) {
      if (!metric.category) throw new Error(`Category is required for a metric`);
      if (!metric.name) throw new Error(`Metric name is required`);
      if (!metric.target || parseFloat(metric.target) <= 0) {
        throw new Error(`Valid target is required for metric: ${metric.name}`);
      }
      if (!metric.weightage || parseFloat(metric.weightage) <= 0) {
        throw new Error(`Valid weightage is required for metric: ${metric.name}`);
      }
    }
  }

  const kraDocs = employees.map((empData) => {
    const employee = employeeDocs.find(e => e._id.toString() === empData.employeeId);
    
    return {
      title: title || `KRA - ${new Date().getFullYear()}`,
      description: description || '',
      departmentId: new ObjectId(departmentId),
      employeeId: new ObjectId(empData.employeeId),
      managerId: employee?.reportingManager ? new ObjectId(employee.reportingManager) : null,
      period: period || 'quarterly',
      startDate: startDate || new Date(),
      endDate: endDate || new Date(new Date().setMonth(new Date().getMonth() + 3)),
      batchId,
      metrics: empData.metrics.map((m) => ({
        category: m.category,
        name: m.name,
        target: parseFloat(m.target) || 0,
        weightage: parseFloat(m.weightage) || 0,
        achieved: 0,
        score: 0,
        status: "pending",
      })),
      status: "pending",
      totalScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  const result = await KRA.insertMany(kraDocs);
  return result;
};

/**
 * Get all KRAs with grouping by batch
 */
const getAllKRA = async (filterQuery = {}) => {
  const kras = await KRA.find(filterQuery)
    .populate({
      path: "employeeId",
      select: "fullName email employeeCode",
    })
    .populate({
      path: "departmentId",
      select: "name code",
    })
    .lean()
    .sort({ createdAt: -1 });

  const grouped = {};

  kras.forEach((kra) => {
    const key = kra.batchId || kra._id.toString();

    if (!grouped[key]) {
      grouped[key] = {
        id: kra._id,
        batchId: kra.batchId || kra._id.toString(),
        title: kra.title || 'KRA',
        description: kra.description || '',
        department: kra.departmentId?.name || null,
        departmentId: kra.departmentId?._id || null,
        employees: [],
        employeeIds: [],
        employeeMetrics: {},
        period: kra.period || 'quarterly',
        createdBy: kra.createdBy || 'Admin',
        createdOn: kra.createdAt || new Date(),
        status: kra.status || 'pending',
        totalScore: kra.totalScore || 0,
      };
    }

    if (kra.employeeId?.fullName) {
      grouped[key].employees.push(kra.employeeId.fullName);
    }
    if (kra.employeeId?._id) {
      grouped[key].employeeIds.push(kra.employeeId._id.toString());
    }
    
    if (kra.employeeId?.fullName) {
      grouped[key].employeeMetrics[kra.employeeId.fullName] = {
        employeeId: kra.employeeId._id,
        metrics: kra.metrics.map(m => ({
          category: m.category,
          name: m.name,
          target: m.target,
          achieved: m.achieved || 0,
          score: m.score || 0,
          status: m.status || 'pending',
          weightage: m.weightage,
        }))
      };
    }
  });

  return Object.values(grouped);
};

/**
 * Get KRAs by batch ID with detailed employee-specific metrics
 */
const getKRAByBatchId = async (batchId) => {
  const kras = await KRA.find({ batchId })
    .populate({
      path: "employeeId",
      select: "fullName email employeeCode _id",
    })
    .populate({
      path: "departmentId",
      select: "name code _id",
    })
    .lean();

  if (kras.length === 0) {
    throw new Error("No KRAs found in this batch");
  }

  const employees = kras.map(k => ({
    id: k._id,
    kraId: k._id,
    name: k.employeeId?.fullName || 'Unknown Employee',
    email: k.employeeId?.email || '',
    employeeCode: k.employeeId?.employeeCode || '',
    employeeId: k.employeeId?._id || null,
    metrics: k.metrics.map(m => ({
      category: m.category,
      name: m.name,
      target: m.target,
      weightage: m.weightage,
      achieved: m.achieved || 0,
      score: m.score || 0,
      status: m.status || 'pending'
    })),
    status: k.status || 'pending',
    totalScore: k.totalScore || 0,
  }));

  return {
    batchId: batchId,
    department: kras[0].departmentId?.name || 'Unknown',
    departmentId: kras[0].departmentId?._id || null,
    period: kras[0].period || 'quarterly',
    title: kras[0].title || 'KRA',
    description: kras[0].description || '',
    startDate: kras[0].startDate,
    endDate: kras[0].endDate,
    employees: employees,
    createdOn: kras[0].createdAt,
    status: kras[0].status || 'pending',
  };
};

/**
 * Update individual employee's KRA
 */
const updateIndividualKRA = async (id, data) => {
  const { title, description, period, startDate, endDate, metrics, departmentId } = data;

  if (!metrics || metrics.length === 0) {
    throw new Error("At least one metric is required");
  }

  const totalWeight = metrics.reduce((sum, m) => sum + (parseFloat(m.weightage) || 0), 0);
  if (totalWeight !== 100) {
    throw new Error(`Total weightage must be 100% (currently ${totalWeight}%)`);
  }

  for (const metric of metrics) {
    if (!metric.category) throw new Error(`Category is required for a metric`);
    if (!metric.name) throw new Error(`Metric name is required`);
    if (!metric.target || parseFloat(metric.target) <= 0) {
      throw new Error(`Valid target is required for metric: ${metric.name}`);
    }
    if (!metric.weightage || parseFloat(metric.weightage) <= 0) {
      throw new Error(`Valid weightage is required for metric: ${metric.name}`);
    }
  }

  const kra = await KRA.findById(id);
  if (!kra) {
    throw new Error("KRA not found");
  }

  kra.title = title || kra.title;
  kra.description = description || kra.description;
  kra.period = period || kra.period;
  kra.startDate = startDate || kra.startDate;
  kra.endDate = endDate || kra.endDate;
  if (departmentId) {
    kra.departmentId = new ObjectId(departmentId);
  }
  kra.metrics = metrics.map((m) => ({
    category: m.category,
    name: m.name,
    target: parseFloat(m.target) || 0,
    weightage: parseFloat(m.weightage) || 0,
    achieved: 0,
    score: 0,
    status: "pending",
  }));
  kra.totalScore = 0;
  kra.status = "pending";
  kra.updatedAt = new Date();

  await kra.save();
  return kra;
};

/**
 * Delete entire batch of KRAs
 */
const deleteKRA = async (batchId) => {
  const result = await KRA.deleteMany({ batchId: batchId });
  if (result.deletedCount === 0) {
    throw new Error("No KRAs found in this batch");
  }
  return result;
};

/**
 * Delete individual KRA
 */
const deleteIndividualKRA = async (id) => {
  const kra = await KRA.findByIdAndDelete(id);
  if (!kra) {
    throw new Error("KRA not found");
  }
  return kra;
};

module.exports = {
  createKRAForEmployees,
  getAllKRA,
  getKRAByBatchId,
  updateIndividualKRA,
  deleteKRA,
  deleteIndividualKRA,
};