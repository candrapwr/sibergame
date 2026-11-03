module.exports = {
  apps: [
    {
      name: "datasiber-game-hub",
      cwd: __dirname,
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8050",
        OPEN_BROWSER: "false"
      }
    }
  ]
};
