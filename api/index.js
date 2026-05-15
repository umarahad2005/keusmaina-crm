// Vercel serverless entry — wraps the Express app so it can run as a single
// function. Path-A migration: same Express app, no code rewrite per route.
//
// Vercel routes /api/* to this file (see ../vercel.json). The app itself
// handles the /api prefix internally, so requests reach the right handlers
// unchanged.

const serverless = require('serverless-http');
const app = require('../server/server');

module.exports = serverless(app, {
    // Pass Vercel's request through to Express unchanged. Default options
    // already do the right thing for body parsing, headers, etc.
});
