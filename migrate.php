<?php
// Key-gated migration runner.
//
// Applies any sql/*.sql file not yet recorded in chainlift_migrations, in
// filename order. Every migration is written to be idempotent, so re-running
// after a partial failure is safe.

require_once __DIR__ . '/api/db.php';

header('Content-Type: text/plain; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (!chainlift_config_loaded() || !defined('CHAINLIFT_MIGRATE_KEY') || CHAINLIFT_MIGRATE_KEY === '') {
    http_response_code(503);
    exit("Migrate key is not configured on the server.\n");
}

$supplied = $_GET['key'] ?? '';
if (!is_string($supplied) || !hash_equals(CHAINLIFT_MIGRATE_KEY, $supplied)) {
    http_response_code(403);
    exit("Forbidden\n");
}

try {
    $db = chainlift_db();
} catch (Throwable $e) {
    http_response_code(500);
    exit('Database unavailable: ' . $e->getMessage() . "\n");
}

// The ledger has to exist before it can be consulted, and 001 creates it, so
// it is created here too rather than depending on its own migration.
$db->exec(
    'CREATE TABLE IF NOT EXISTS chainlift_migrations (
       filename VARCHAR(190) NOT NULL,
       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (filename)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);

$applied = $db->query('SELECT filename FROM chainlift_migrations')->fetchAll(PDO::FETCH_COLUMN);
$applied = array_flip($applied);

$files = glob(__DIR__ . '/sql/*.sql') ?: [];
sort($files, SORT_STRING);

$ran = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (isset($applied[$name])) {
        echo "skip  {$name}\n";
        continue;
    }

    echo "apply {$name}\n";
    $sql = file_get_contents($file);
    if ($sql === false) {
        http_response_code(500);
        exit("  could not read {$name}\n");
    }

    foreach (chainlift_split_sql($sql) as $statement) {
        try {
            $db->exec($statement);
        } catch (Throwable $e) {
            http_response_code(500);
            // Stop at the first failure and record nothing, so a re-run starts
            // this file again from the top.
            exit("  FAILED: " . $e->getMessage() . "\n  in: " . substr($statement, 0, 200) . "\n");
        }
    }

    $stmt = $db->prepare('INSERT IGNORE INTO chainlift_migrations (filename) VALUES (:f)');
    $stmt->execute([':f' => $name]);
    $ran++;
}

echo "\n{$ran} migration(s) applied.\n";

// Splits on semicolons that end a statement, ignoring those inside strings or
// line comments. Adequate for the controlled DDL in this repo; it is not a
// general SQL parser and should not be handed arbitrary input.
function chainlift_split_sql(string $sql): array
{
    $statements = [];
    $current = '';
    $inSingle = false;
    $inDouble = false;
    $length = strlen($sql);

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];
        $next = $i + 1 < $length ? $sql[$i + 1] : '';

        if (!$inSingle && !$inDouble && $char === '-' && $next === '-') {
            while ($i < $length && $sql[$i] !== "\n") {
                $i++;
            }
            $current .= "\n";
            continue;
        }

        if ($char === "'" && !$inDouble) {
            $inSingle = !$inSingle;
        } elseif ($char === '"' && !$inSingle) {
            $inDouble = !$inDouble;
        }

        if ($char === ';' && !$inSingle && !$inDouble) {
            $trimmed = trim($current);
            if ($trimmed !== '') {
                $statements[] = $trimmed;
            }
            $current = '';
            continue;
        }

        $current .= $char;
    }

    $trimmed = trim($current);
    if ($trimmed !== '') {
        $statements[] = $trimmed;
    }

    return $statements;
}
