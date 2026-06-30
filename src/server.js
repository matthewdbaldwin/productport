'use strict';
require('dotenv').config();
const app = require('./app');
const logger = require('./lib/logger');

const PORT = process.env.PORT || 4006;
app.listen(PORT, () => logger.info(`ProductPort API listening on :${PORT}`));
