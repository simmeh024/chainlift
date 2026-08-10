<?php
// Shared API plumbing: JSON responses, security headers, request parsing.

require_once __DIR__ . '/db.php';

function chainlift_send_headers(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Cache-Control: no-store');
}

function chainlift_json($data, int $status = 200): void
{
    chainlift_send_headers();
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function chainlift_fail(string $message, int $status = 400): void
{
    chainlift_json(['error' => $message], $status);
}

function chainlift_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// A player is identified only by an opaque token their own browser generated.
// There are no accounts in v0: this stores a sandbox save and nothing personal,
// so an account system would be a barrier with nothing behind it.
function chainlift_player_token(array $source): ?string
{
    $token = $source['player'] ?? $_GET['player'] ?? null;
    if (!is_string($token)) {
        return null;
    }
    $token = trim($token);
    return preg_match('/^[a-f0-9-]{16,64}$/i', $token) ? $token : null;
}

function chainlift_slot(array $source): string
{
    $slot = $source['slot'] ?? $_GET['slot'] ?? 'autosave';
    if (!is_string($slot)) {
        return 'autosave';
    }
    $slot = preg_replace('/[^a-z0-9_-]/i', '', $slot);
    return $slot === '' ? 'autosave' : substr($slot, 0, 32);
}
