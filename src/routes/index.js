const express = require("express");
const authRoute = require("./auth.route");
const attendanceRoute = require("./attendance.routes");
const activitiesRoute = require("./activities.route");
const calandarRoutes = require("./calendar.routes");
const holidayRoutes = require("./holiday.route");
const leaveRoutes = require("./leave.route");
const employeeRoute = require('./employee.route')
const webhooksRoute = require('./webhook.route')
const kraRoute = require('./kra.route');
const meetingRoute = require('./meeting.route');
const expenseRoute = require('./expense.route.js')
const fuelRateRoute = require('./fuelRate.route.js');

const { path } = require("../app");
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
    path: "/activities",
    route: activitiesRoute,
  },

  {
    path: "/calendar",
    route: calandarRoutes,
  },
  {
    path: "/holidays",
    route: holidayRoutes,
  },

  {
    path: "/leave",
    route: leaveRoutes
  },
  {
    path: '/employee',
    route: employeeRoute
  },
  {
    path: '/webhooks',
    route: webhooksRoute
  },
  {
    path: '/kra',
    route: kraRoute
  },
  {
    path: '/meeting',
    route: meetingRoute
  },
  {
    path: '/expense',
    route: expenseRoute
  },
  ,
  {
    path: "/fuel-rates",
    route: fuelRateRoute
  }
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
