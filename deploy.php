<?php
// Key-gated deploy: pulls the latest commit into the deployed checkout.
//
// This exists so the whole push -> live loop needs no manual cPanel clicks.
// It is deliberately narrow: it runs one fixed git command in one fixed
// directory and can do nothing else.
//
// SECURITY: this changes the code being served. The key is the only thing
// standing in front of it, so it must be long and random, and this file should
// be deleted once the prototype phase is over.

require_once __DIR__ . '/api/db.php';

header('Content-Type: text/plain; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (!chainlift_config_loaded() || !defined('CHAINLIFT_DEPLOY_KEY') || CHAINLIFT_DEPLOY_KEY === '') {
    http_response_code(503);
    exit("Deploy key is not configured on the server.\n");
}

$supplied = $_GET['key'] ?? '';
if (!is_string($supplied) || !hash_equals(CHAINLIFT_DEPLOY_KEY, $supplied)) {
    // Same response either way, so this cannot be used to probe for the key.
    http_response_code(403);
    exit("Forbidden\n");
}

$repo = defined('CHAINLIFT_REPO_PATH') ? CHAINLIFT_REPO_PATH : __DIR__;

if (!is_dir($repo . '/.git')) {
    http_response_code(500);
    exit("Not a git checkout: {$repo}\nClone the repo here once via cPanel -> Git Version Control.\n");
}

if (!function_exists('shell_exec')) {
    http_response_code(500);
    exit("shell_exec is unavailable on this host.\n");
}

$commands = [
    'git -C ' . escapeshellarg($repo) . ' fetch --all 2>&1',
    // reset --hard, not pull: the served copy should mirror origin exactly.
    // Nothing is ever edited on the server, so there is no local work to
    // preserve, and unlike the main site's `cp -R` deploy this genuinely
    // removes files that were deleted from the repo.
    'git -C ' . escapeshellarg($repo) . ' reset --hard origin/main 2>&1',
    'git -C ' . escapeshellarg($repo) . ' rev-parse --short HEAD 2>&1',
];

foreach ($commands as $command) {
    echo '$ ' . $command . "\n";
    echo shell_exec($command) ?? '(no output)';
    echo "\n";
}

echo "Deployed.\n";
