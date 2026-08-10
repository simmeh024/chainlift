<?php
require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    chainlift_fail('POST required', 405);
}

$body = chainlift_body();
$token = chainlift_player_token($body);
if ($token === null) {
    chainlift_fail('A player token is required.');
}

$state = $body['state'] ?? null;
if (!is_array($state)) {
    chainlift_fail('No park state supplied.');
}

$encoded = json_encode($state, JSON_UNESCAPED_SLASHES);
if ($encoded === false) {
    chainlift_fail('Park state could not be encoded.');
}

// A 48x48 park serializes to roughly 40KB. The ceiling is generous enough for
// a full park and low enough that this endpoint cannot be used as free storage.
if (strlen($encoded) > 2 * 1024 * 1024) {
    chainlift_fail('Park state is too large.', 413);
}

$name = $state['name'] ?? 'Chainlift Park';
if (!is_string($name) || $name === '') {
    $name = 'Chainlift Park';
}

try {
    $db = chainlift_db();
    $statement = $db->prepare(
        'INSERT INTO chainlift_parks (player_token, slot, name, state)
         VALUES (:token, :slot, :name, :state)
         ON DUPLICATE KEY UPDATE name = VALUES(name), state = VALUES(state)'
    );
    $statement->execute([
        ':token' => $token,
        ':slot' => chainlift_slot($body),
        ':name' => mb_substr($name, 0, 80),
        ':state' => $encoded,
    ]);
} catch (Throwable $e) {
    // The browser keeps a local copy, so the player has not lost anything.
    chainlift_fail('Server save failed: ' . $e->getMessage(), 500);
}

chainlift_json(['ok' => true, 'bytes' => strlen($encoded)]);
