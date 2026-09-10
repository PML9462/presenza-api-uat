module.exports = {
  apps: [
    {
      name: "presenza-api-prod",
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      ignore_watch: ["node_modules", ".git", "uploads"],
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};