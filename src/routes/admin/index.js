const express = require("express");
const attendanceRoute = require("./attendance.route");
const authRoute = require("./auth.route");
const employeeRoute = require("./employee.route");
const departmentRoute = require("./department.route");
const designationRoute = require("./designation.route.js");
const actvityRoute = require('./activities.route.js');
const dashboardRoute = require("./dashboard.route.js")
const leaveRoute = require("./leave.route.js")
const leaveType = require('./leaveType.route.js')
const shiftPolicyRoutes = require("./shiftPolicy.route");
const weekOffRoutes = require("./weeklyOff.routes");
const officeRoutes = require('./office.route.js');
const kraRoutes = require('./kra.route.js');
const expenseRoute = require('./expense.route.js')
const payrollRoute = require('./payroll.route.js');
const kraCategoryRoute = require('./kraCategory.routes.js');
const fuelRateRoute = require('./fuelRate.route.js');
const reportRoute = require('./report.route.js');
const { path } = require("../../app.js");

const router = express.Router();

const defaultRoutes = [
    {
        path: "/auth",
        route: authRoute,
    },
    {
        path: "/attendance",
        route: attendanceRoute,
    },
    {
        path: "/employee",
        route: employeeRoute,
    },
    {
        path: "/department",
        route: departmentRoute,
    },
    {
        path: "/designation",
        route: designationRoute,
    },
    {
        path: "/activities",
        route: actvityRoute,
    },
    {
        path: "/dashboard",
        route: dashboardRoute,
    },
    {
        path: "/leave",
        route: leaveRoute,
    },
    {
        path: "/leave-type",
        route: leaveType,
    },
    {
        path: "/shift-policies",
        route: shiftPolicyRoutes,
    },
    {
        path: "/week-off",
        route: weekOffRoutes
    },
    ,
    {
        path: "/office",
        route: officeRoutes
    },
    {
        path: "/kra",
        route: kraRoutes
    },
    {
        path: "/expense",
        route: expenseRoute
    },
    {
        path: "/payroll",
        route: payrollRoute
    },
    {
        path: "/kra-category",
        route: kraCategoryRoute
    },
    {
        path: "/fuel-rates",
        route: fuelRateRoute
    },
    {
        path: "/report",
        route: reportRoute
    }
];

defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});

module.exports = router;
