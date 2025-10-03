// client/src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

  app.use(
    [
      '/api',           // all REST API routes
      '/upload',        // the POST /upload from step 1
      '/uploads',       // static images saved by the server
      '/avatars',       // avatar files (if used)
      '/auth', '/me', '/logout', '/session', // auth/session endpoints if you expose them
    ],
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
      logLevel: 'warn',
    })
  );
};
