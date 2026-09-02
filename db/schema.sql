CREATE TABLE IF NOT EXISTS admins (
 id BIGSERIAL PRIMARY KEY,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artists (
 id BIGSERIAL PRIMARY KEY,
 name TEXT NOT NULL,
 location TEXT NOT NULL,
 phone TEXT,
 experience TEXT,
 starting_price INTEGER,
 specialty TEXT,
 image_url TEXT,
 about TEXT,
 rating NUMERIC(2,1),
 verified BOOLEAN NOT NULL DEFAULT FALSE,
 featured BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
 id BIGSERIAL PRIMARY KEY,
 booking_code TEXT UNIQUE NOT NULL,
 artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,
 customer_name TEXT NOT NULL,
 customer_phone TEXT NOT NULL,
 customer_email TEXT,
 event_date DATE NOT NULL,
 event_time TIME NOT NULL,
 event_location TEXT NOT NULL,
 notes TEXT,
 status TEXT NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','confirmed','completed','cancelled')),
 payment_status TEXT NOT NULL DEFAULT 'unpaid'
   CHECK(payment_status IN ('unpaid','created','paid','failed','refunded')),
 payment_order_id TEXT,
 payment_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_artist_date_idx
ON bookings(artist_id,event_date,event_time);
