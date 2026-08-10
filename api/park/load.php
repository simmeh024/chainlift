<?php
require_once __DIR__ . '/../helpers.php';

$token = chainlift_player_token([]);
if ($token === null) {
    chainlift_fail('A player token is required.');
}

try {
    $db = chainlift_db();
    $statement = $db->prepare(
        'SELECT name, state, updated_at
         FROM chainlift_parks
         WHERE player_token = :token AND slot = :slot
         LIMIT 1'
    );
    $statement->execute([
        ':token' => $token,
        ':slot' => chainlift_slot([]),
    ]);
    $row = $statement->fetch();
} catch (Throwable $e) {
    chainlift_fail('Server load failed: ' . $e->getMessage(), 500);
}

if (!$row) {
    chainlift_fail('No saved park found.', 404);
}

$state = json_decode($row['state'], true);
if (!is_array($state)) {
    chainlift_fail('Saved park was unreadable.', 500);
}

chainlift_json([
    'ok' => true,
    'name' => $row['name'],
    'updated_at' => $row['updated_at'],
    'state' => $state,
]);
