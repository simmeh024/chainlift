<?php
// Database connection.
//
// Config is loaded from outside the web root. If it is missing the site still
// serves — the game runs entirely in the browser and falls back to
// localStorage — so a missing config degrades saving rather than breaking play.

const CHAINLIFT_SECRETS = '/home/rdy3i6my40b0/chainlift-secrets/config.php';

function chainlift_config_loaded(): bool
{
    static $loaded = null;
    if ($loaded !== null) {
        return $loaded;
    }

    if (is_readable(CHAINLIFT_SECRETS)) {
        require_once CHAINLIFT_SECRETS;
    } elseif (is_readable(__DIR__ . '/config.php')) {
        // Local development fallback only. Never commit api/config.php.
        require_once __DIR__ . '/config.php';
    }

    $loaded = defined('CHAINLIFT_DB_NAME') && defined('CHAINLIFT_DB_USER');
    return $loaded;
}

function chainlift_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!chainlift_config_loaded()) {
        throw new RuntimeException('Configuration not found on the server.');
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        CHAINLIFT_DB_HOST,
        CHAINLIFT_DB_NAME
    );

    $pdo = new PDO($dsn, CHAINLIFT_DB_USER, CHAINLIFT_DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}
