module.exports = {
    apps: [{
        name: 'mrkekbot',
        script: 'dist/index.js',
        watch: false,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        env: {
            NODE_ENV: 'production',
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/error.log',
        out_file: './logs/out.log',
    }]
};
