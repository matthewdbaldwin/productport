'use strict';
require('dotenv').config();
const logger = require('./lib/logger');
const pkg = require('../package.json');

// Emitted BEFORE ./app is required, so a crash during app init still names
// the build that crashed. feedback_db_migrate_pattern / matches hubport.
logger.info(`${pkg.name}@${pkg.version} start`);

const app = require('./app');

const PORT = process.env.PORT || 4006;
app.listen(PORT, () => logger.info(`ProductPort API listening on :${PORT}`));
