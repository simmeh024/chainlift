-- Chainlift — initial schema.
-- Every statement is idempotent so a migration that fails partway can be
-- re-run from the top.

CREATE TABLE IF NOT EXISTS chainlift_migrations (
  filename    VARCHAR(190) NOT NULL,
  applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chainlift_parks (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_token  VARCHAR(64) NOT NULL,
  slot          VARCHAR(32) NOT NULL DEFAULT 'autosave',
  name          VARCHAR(80) NOT NULL DEFAULT 'Chainlift Park',
  -- The whole serialized park. A blob rather than normalized tables because
  -- the server never reads into it: the simulation runs in the browser and
  -- this is storage, not a model. Normalizing it would buy nothing and would
  -- have to change every time the sim gains a field.
  state         LONGTEXT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_player_slot (player_token, slot),
  KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
