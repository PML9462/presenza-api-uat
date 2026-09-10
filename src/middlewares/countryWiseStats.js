const geoip = require("geoip-lite");
const fs = require("fs");
const path = require("path");

const dataFilePath = path.join(__dirname, "new_statistics.json");

const ensureFileExists = () => {
  if (!fs.existsSync(dataFilePath)) {
    const initialData = {
      entries: [],
    };
    fs.writeFileSync(dataFilePath, JSON.stringify(initialData, null, 2));
  }
};

const userExistsForToday = (stats, country, city) => {
  const today = new Date().toISOString().split("T")[0];

  return stats.entries.some((entry) => {
    return (
      entry.date.startsWith(today) &&
      entry.country === country &&
      entry.city === city
    );
  });
};

const updateStatistics = (country, city) => {
  ensureFileExists();

  const stats = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));

  if (!userExistsForToday(stats, country, city)) {
    stats.entries.push({
      date: new Date().toISOString(),
      country,
      city,
    });

    fs.writeFileSync(dataFilePath, JSON.stringify(stats, null, 2));
  } else {
  }
};

const newCountryMiddleware = (req, res, next) => {
  const ip = req.ip || req.headers["x-forwarded-for"];
  const geo = geoip.lookup(ip);

  if (geo && geo.country) {
    const country = geo.country;
    const city = geo.city;

    updateStatistics(country, city);
  }

  next();
};

module.exports = newCountryMiddleware;
