# Mehendi Artist Book — real public website

This version upgrades the original static HTML into a deployable full-stack site:
- PostgreSQL database for artists, admins and bookings
- Secure hashed admin passwords + JWT sessions
- Public artist search and profiles
- Real booking records with collision checking
- Admin dashboard for artists and booking statuses
- Helmet/CORS/validation basics
- Optional Razorpay variables are reserved for adding online advance payments

## Deploy
1. Create a PostgreSQL database (Supabase, Neon, Render Postgres, Railway, etc.).
2. Run `db/schema.sql` in the database SQL editor.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` and a strong `JWT_SECRET`.
4. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first admin account.
5. Run `npm install` then `npm start`.
6. Deploy the project to a Node.js host (Render/Railway/Fly.io/etc.).

The app serves the public website from `/` and API routes from `/api/*`.

### Important
A real online payment gateway still needs merchant credentials and webhook handling before money should be accepted. The booking system itself is database-backed and live once deployed.
