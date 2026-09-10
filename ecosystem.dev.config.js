module.exports = {
  apps: [
    {
      name: "presenza-api-dev",
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: true,
      time: true,
      ignore_watch: ["node_modules", ".git", "uploads"],
      env: {
        NODE_ENV: "development"
      }
    }
  ]
};