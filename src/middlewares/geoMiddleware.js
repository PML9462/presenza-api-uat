const geoip = require('geoip-lite');
const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, 'country_data.json');
const statsFilePath = path.join(__dirname, 'statistics.json');

const ensureFileExists = (filePath) => {
  if (!fs.existsSync(filePath)) {
    const initialData = {};
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  }
};

const updateStatistics = (country) => {
  ensureFileExists(statsFilePath);

  let stats;
  try {
    stats = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
  } catch (err) {
    stats = {};
  }

  // Update statistics based on the country
  if (stats[country]) {
    stats[country]++;
  } else {
    stats[country] = 1;
  }

  // Write the updated statistics back to the file
  fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2));

  // Log the statistics
};

const countryMiddleware = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'];


  const geo = geoip.lookup(ip);

  if (geo && geo.country) {
    ensureFileExists(dataFilePath);

    const country = geo.country;

    // Update country data
    let data;
    try {
      data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    } catch (err) {
      data = {};
    }

    if (data[country]) {
      data[country].count++;
    } else {
      data[country] = { count: 1 };
    }

    // Write the updated data back to the file
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));

    // Log the information
    // Update statistics

    // Update statistics
    updateStatistics(country);
  }

  next();
};

module.exports = countryMiddleware;
