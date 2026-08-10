<?php
// Chainlift — configuration template.
//
// DO NOT put real credentials in this file. It is committed to a PUBLIC repo.
//
// Copy it to the real location OUTSIDE the web root, which is where api/db.php
// looks first:
//
//     /home/rdy3i6my40b0/chainlift-secrets/config.php
//
// That mirrors how the main Pantheon Wars site keeps its secrets, and it means
// nothing sensitive is ever reachable over HTTP even if PHP stops executing.

// --- database ----------------------------------------------------------
define('CHAINLIFT_DB_HOST', 'localhost');
// cPanel usually prefixes databases with the account name. Check the exact
// string in cPanel -> MySQL Databases; it is likely rdy3i6my40b0_Chainlift.
define('CHAINLIFT_DB_NAME', 'rdy3i6my40b0_Chainlift');
define('CHAINLIFT_DB_USER', 'rdy3i6my40b0_chainlift');
define('CHAINLIFT_DB_PASS', '');

// --- operations endpoints ---------------------------------------------
// Long random strings. These gate deploy.php and migrate.php, which can pull
// code and alter the database, so treat them like passwords.
define('CHAINLIFT_DEPLOY_KEY', '');
define('CHAINLIFT_MIGRATE_KEY', '');

// Absolute path to the deployed checkout that deploy.php runs `git pull` in.
define('CHAINLIFT_REPO_PATH', '/home/rdy3i6my40b0/public_html/Chainlift');
