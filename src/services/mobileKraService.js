const { ObjectId } = require("mongodb");
const { KRA, Employee, Department } = require("../models/index");

/**
 * Get all KRAs for a specific employee
 */
const getEmployeeKRAs = async (employeeId) => {
  const employeeObjectId = new ObjectId(employeeId);
  
  // Find all KRAs for this employee
  const kras = await KRA.find({ 
    employeeId: employeeObjectId 
  })
    .populate({
      path: "departmentId",
      select: "name code",
    })
    .populate({
      path: "employeeId",
      select: "fullName email employeeCode",
    })
    .sort({ createdAt: -1 })
    .lean();

  if (kras.length === 0) {
    return {
      total: 0,
      active: 0,
      completed: 0,
      pending: 0,
      kras: []
    };
  }

  // Group by batch for better mobile display
  const grouped = {};
  let activeCount = 0;
  let completedCount = 0;
  let pendingCount = 0;

  kras.forEach((kra) => {
    const key = kra.batchId || kra._id.toString();
    
    if (!grouped[key]) {
      grouped[key] = {
        batchId: kra.batchId || kra._id.toString(),
        title: kra.title || 'KRA',
        description: kra.description || '',
        department: kra.departmentId?.name || 'Unknown',
        period: kra.period || 'quarterly',
        startDate: kra.startDate,
        endDate: kra.endDate,
        status: kra.status || 'pending',
        totalScore: kra.totalScore || 0,
        metrics: kra.metrics || [],
        createdAt: kra.createdAt,
        updatedAt: kra.updatedAt,
        kraId: kra._id,
        isBatch: false,
        employeeName: kra.employeeId?.fullName || 'Unknown',
      };
    }

    // Count statuses
    const status = kra.status || 'pending';
    if (status === 'active' || status === 'in-progress') activeCount++;
    else if (status === 'completed') completedCount++;
    else if (status === 'pending') pendingCount++;
  });

  return {
    total: kras.length,
    active: activeCount,
    completed: completedCount,
    pending: pendingCount,
    kras: Object.values(grouped),
  };
};

/**
 * Get a specific KRA by ID for an employee
 */
const getEmployeeKRAById = async (kraId, employeeId) => {
  const kra = await KRA.findOne({
    _id: new ObjectId(kraId),
    employeeId: new ObjectId(employeeId),
  })
    .populate({
      path: "departmentId",
      select: "name code",
    })
    .populate({
      path: "employeeId",
      select: "fullName email employeeCode",
    })
    .lean();

  if (!kra) {
    throw new Error("KRA not found or you don't have access");
  }

  return {
    id: kra._id,
    title: kra.title || 'KRA',
    description: kra.description || '',
    department: kra.departmentId?.name || 'Unknown',
    departmentId: kra.departmentId?._id || null,
    employeeName: kra.employeeId?.fullName || 'Unknown',
    period: kra.period || 'quarterly',
    startDate: kra.startDate,
    endDate: kra.endDate,
    status: kra.status || 'pending',
    totalScore: kra.totalScore || 0,
    metrics: kra.metrics.map(m => ({
      id: m._id,
      category: m.category,
      name: m.name,
      target: m.target,
      achieved: m.achieved || 0,
      weightage: m.weightage,
      score: m.score || 0,
      status: m.status || 'pending',
    })),
    createdAt: kra.createdAt,
    updatedAt: kra.updatedAt,
  };
};

/**
 * Update metrics for an employee's KRA (update achieved values)
 */
const updateEmployeeKRAMetrics = async (kraId, employeeId, metrics) => {
  const kra = await KRA.findOne({
    _id: new ObjectId(kraId),
    employeeId: new ObjectId(employeeId),
  });

  if (!kra) {
    throw new Error("KRA not found or you don't have access");
  }

  // Validate metrics
  for (const metric of metrics) {
    if (!metric.id && !metric._id) {
      throw new Error("Metric ID is required");
    }
    if (metric.achieved === undefined || metric.achieved === null) {
      throw new Error("Achieved value is required for each metric");
    }
    if (isNaN(metric.achieved) || metric.achieved < 0) {
      throw new Error("Achieved value must be a positive number");
    }
  }

  // Update each metric
  const updatedMetrics = kra.metrics.map((existingMetric) => {
    const update = metrics.find(
      m => m.id === existingMetric._id.toString() || m._id === existingMetric._id.toString()
    );
    
    if (update) {
      // Calculate score based on achieved vs target
      const achieved = parseFloat(update.achieved) || 0;
      const target = existingMetric.target || 1;
      const score = Math.min((achieved / target) * 100, 100);
      
      return {
        ...existingMetric,
        achieved: achieved,
        score: score,
        status: achieved >= target ? 'completed' : 'in_progress',
      };
    }
    return existingMetric;
  });

  // Calculate total score
  const totalScore = updatedMetrics.reduce((sum, m) => sum + (m.score || 0), 0);
  
  // Determine overall status
  const allCompleted = updatedMetrics.every(m => m.status === 'completed');
  const anyProgress = updatedMetrics.some(m => m.status === 'in-progress');
  const overallStatus = allCompleted ? 'completed' : anyProgress ? 'in-progress' : 'pending';

  kra.metrics = updatedMetrics;
  kra.totalScore = totalScore;
  kra.status = overallStatus;
  kra.updatedAt = new Date();

  await kra.save();

  return {
    id: kra._id,
    title: kra.title,
    status: kra.status,
    totalScore: kra.totalScore,
    metrics: kra.metrics,
  };
};

/**
 * Update KRA status for an employee
 */
const updateEmployeeKRAStatus = async (kraId, employeeId, status) => {
  const kra = await KRA.findOne({
    _id: new ObjectId(kraId),
    employeeId: new ObjectId(employeeId),
  });

  if (!kra) {
    throw new Error("KRA not found or you don't have access");
  }

  kra.status = status;
  kra.updatedAt = new Date();

  await kra.save();

  return {
    id: kra._id,
    title: kra.title,
    status: kra.status,
  };
};

/**
 * Get KRA dashboard for employee
 */
const getKRADashboard = async (employeeId) => {
  const employeeObjectId = new ObjectId(employeeId);
  
  // Get all KRAs for this employee
  const kras = await KRA.find({ 
    employeeId: employeeObjectId 
  })
    .populate({
      path: "departmentId",
      select: "name code",
    })
    .sort({ createdAt: -1 })
    .lean();

  // Calculate stats
  const total = kras.length;
  const completed = kras.filter(k => k.status === 'completed').length;
  const inProgress = kras.filter(k => k.status === 'in-progress' || k.status === 'active').length;
  const pending = kras.filter(k => k.status === 'pending').length;
  
  // Calculate average score
  const totalScore = kras.reduce((sum, k) => sum + (k.totalScore || 0), 0);
  const averageScore = total > 0 ? Math.round(totalScore / total) : 0;

  // Get recent activity (last 5 KRAs)
  const recentKRAs = kras.slice(0, 5).map(k => ({
    id: k._id,
    title: k.title || 'KRA',
    status: k.status || 'pending',
    totalScore: k.totalScore || 0,
    updatedAt: k.updatedAt,
    department: k.departmentId?.name || 'Unknown',
  }));

  // Get metrics progress
  const allMetrics = [];
  kras.forEach(kra => {
    kra.metrics.forEach(metric => {
      allMetrics.push({
        category: metric.category,
        name: metric.name,
        achieved: metric.achieved || 0,
        target: metric.target || 1,
        weightage: metric.weightage || 0,
        score: metric.score || 0,
        status: metric.status || 'pending',
      });
    });
  });

  // Calculate category-wise progress
  const categoryProgress = {};
  allMetrics.forEach(metric => {
    if (!categoryProgress[metric.category]) {
      categoryProgress[metric.category] = {
        total: 0,
        achieved: 0,
        count: 0,
      };
    }
    categoryProgress[metric.category].total += metric.target;
    categoryProgress[metric.category].achieved += metric.achieved;
    categoryProgress[metric.category].count += 1;
  });

  // Calculate progress percentage for each category
  Object.keys(categoryProgress).forEach(category => {
    const data = categoryProgress[category];
    data.progress = data.total > 0 
      ? Math.round((data.achieved / data.total) * 100) 
      : 0;
    data.averageTarget = data.count > 0 
      ? Math.round(data.total / data.count) 
      : 0;
    data.averageAchieved = data.count > 0 
      ? Math.round(data.achieved / data.count) 
      : 0;
  });

  return {
    summary: {
      totalKRAs: total,
      completed: completed,
      inProgress: inProgress,
      pending: pending,
      averageScore: averageScore,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
    recentKRAs: recentKRAs,
    categoryProgress: categoryProgress,
    allMetrics: allMetrics,
  };
};

module.exports = {
  getEmployeeKRAs,
  getEmployeeKRAById,
  updateEmployeeKRAMetrics,
  updateEmployeeKRAStatus,
  getKRADashboard,
};