CREATE TABLE tickets (
  id             text PRIMARY KEY,
  event_id       text NOT NULL REFERENCES events(id),
  code           text NOT NULL UNIQUE,
  channel        text NOT NULL CHECK (channel IN ('storefront', 'partner')),
  buyer_user_id  text REFERENCES users(id),
  buyer_email    text NOT NULL,
  card_last4     text NOT NULL,
  price_cents    integer NOT NULL CHECK (price_cents > 0),
  status         text NOT NULL CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'refunded')),
  gateway_result text NOT NULL CHECK (gateway_result IN ('approved', 'declined')),
  gateway_due_at timestamptz NOT NULL,
  checked_in_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_event_status_idx ON tickets(event_id, status);
CREATE INDEX tickets_pending_due_idx ON tickets(gateway_due_at) WHERE status = 'pending';
CREATE INDEX tickets_buyer_idx ON tickets(buyer_user_id);
