# RentXPlay API — design

REST over HTTPS, JSON in and out, versioned under `/api/v1`. One Express app split into modules (auth, users, catalogue, items, bookings, payments, trust, chat, admin), as planned in the HLD. Tables referenced here are in [01-data-model.md](01-data-model.md).

Phase labels follow the PRD: **MVP** ships first, **P2** is Phase 2.

## Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `https://api.rentxplay.in/api/v1` (local: `http://localhost:4000/api/v1`) |
| Format | `Content-Type: application/json`; field names in `camelCase` |
| IDs | UUID strings; items also have a `slug` for web URLs |
| Money | Integer **paise** in fields ending `Paise` (`"rentPaise": 120000` = ₹1,200). Clients format for display |
| Dates | Rental days as `YYYY-MM-DD`; moments as ISO 8601 UTC (`2026-12-10T09:30:00Z`) |
| Auth | `Authorization: Bearer <accessToken>` (JWT, 15 minutes). Refresh token: httpOnly `rx_refresh` cookie on web, request body on mobile |
| Pagination | Cursor based: `?limit=20&cursor=<opaque>` → `{ "data": [...], "nextCursor": "…" \| null }`. `limit` max 50 |
| Idempotency | `POST` endpoints that create bookings or payments take an `Idempotency-Key` header (UUID). A repeat with the same key returns the first response |
| Rate limits | Login and OTP: 5 per 15 minutes per IP and per phone/email. Everything else: 100 per minute per user. Over the limit → `429` with `Retry-After` |
| CORS | Only the web origins in `CORS_ORIGINS`, with credentials |

### Responses

Single resource: the object itself. Lists: `{ "data": [...], "nextCursor": … }`.

Errors always use one shape (implemented in `src/middlewares/errors.ts`). Codes are `UPPER_SNAKE_CASE`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields need fixing.",
    "fields": { "password": "Use at least one letter and one number." }
  }
}
```

| Status | `code` examples | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST`, `VALIDATION_FAILED` | Malformed JSON, failed Zod validation (`fields` lists each problem) |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` | Missing or expired access token |
| 403 | `FORBIDDEN`, `NOT_OWNER`, `ACCOUNT_BLOCKED` | Logged in but not allowed |
| 404 | `NOT_FOUND` | Unknown route or resource (also used for items you may not see) |
| 409 | `DATES_TAKEN`, `INVALID_TRANSITION`, `EMAIL_TAKEN`, `PHONE_TAKEN` | Conflicts with current state |
| 422 | `OUTSIDE_DELIVERY_RADIUS`, `BELOW_MIN_DAYS` | Valid input that breaks a business rule |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Bug; details only in logs |

Validation messages reuse the frontend's wording (`src/lib/auth/validate.ts` in the web repo), so a form can show them as they come.

## Auth — MVP (FR-01, FR-02)

Sign-up and log-in take **only email and password**. Name and phone are collected later; a booking needs a verified phone.

| Method | Path | Auth | Purpose | Status |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | — | Create an account | Built |
| POST | `/auth/login` | — | Email + password | Built |
| POST | `/auth/refresh` | refresh token | Rotate the refresh token; new access token | Built |
| POST | `/auth/logout` | refresh token | Revoke the refresh token, clear the cookie | Built |
| POST | `/auth/password/forgot` · `/auth/password/reset` | — | Emailed reset link | Later |
| POST | `/auth/google` | — | **P2** (FR-03) Sign in with a Google ID token | Later |

**Validation** (Zod; the same rules and messages as the web app's `src/lib/auth/validate.ts`):

| Field | Rule | Message |
| --- | --- | --- |
| `email` | Trimmed, lower-cased; empty | Enter your email address. |
| `email` | Must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | Enter an email like name@example.com. |
| `password` (sign-up) | Empty | Enter a password. |
| | Under 8 characters | Use at least 8 characters. |
| | Over 72 **bytes** (bcrypt's limit) | Use 72 characters or fewer. |
| | No letter or no number | Use at least one letter and one number. |
| `password` (log-in) | Empty only | Enter your password. |

`POST /auth/signup` `{ "email": "kavya@example.com", "password": "rentit2026" }`

```json
// 201, plus Set-Cookie: rx_refresh=…; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth
{
  "user": { "id": "…", "email": "kavya@example.com", "name": null, "phone": null, "phoneVerified": false },
  "accessToken": "eyJ…"
}
```

`409 EMAIL_TAKEN` → `fields.email`: "An account with this email already exists. Log in instead." (case-insensitive: `citext` column).

`POST /auth/login` `{ "email", "password" }` → `200`, same body and cookie as sign-up. A wrong password and an unknown email both get the identical `401 INVALID_CREDENTIALS` with `fields.password`: "That email and password don't match.", and take the same time (bcrypt runs against a dummy hash), so the response never reveals which emails have accounts.

**Tokens**

- **Access token:** HS256 JWT, 15 minutes, in the response body. Clients keep it in memory only; its `exp` claim says when to refresh. `401 TOKEN_EXPIRED` means refresh now.
- **Refresh token:** 32 random bytes, 30 days, stored only as a SHA-256 hash. Web: httpOnly, Secure, SameSite=Lax cookie `rx_refresh`, path `/api/v1/auth` (the auth routes under the API prefix), never readable by JavaScript. Mobile (Flutter): send `"client": "mobile"` on sign-up/login to get `refreshToken` in the body, and send it back as `{ "refreshToken" }`.
- **Rotation:** each refresh revokes the old token and links it to the new one (`replaced_by`). If a revoked token is used again it was probably stolen, so every active token of that user is revoked and they log in again (`401 INVALID_REFRESH_TOKEN`).

**Rate limits:** sign-up and log-in each allow 5 attempts per 15 minutes **per IP** and, separately, **per email** → `429 RATE_LIMITED` with `Retry-After`. Kept in memory for now; moves to Redis before running more than one API instance.

**Never logged:** passwords, password hashes, access or refresh tokens. Request bodies are not logged.

## Users — MVP

| Method | Path | Auth | Purpose | Status |
| --- | --- | --- | --- | --- |
| GET | `/me` | Bearer | `{ id, email, name: string \| null, phone: string \| null, phoneVerified: boolean }` | Built |
| PATCH | `/me` | Bearer | `{ name }` (2–60 characters); later area, avatar | Later |
| POST | `/me/phone` | Bearer | `{ phone }` (10-digit Indian mobile) → sends a 6-digit OTP | Later |
| POST | `/me/phone/verify` | Bearer | `{ code }` → sets `phone` and `phoneVerifiedAt` | Later |
| GET | `/me/addresses` · POST · PATCH `/:id` · DELETE `/:id` | Bearer | Saved delivery addresses | Later |
| GET | `/users/:id` | — | Public profile: name, area, rating, rentals, verified badge. Never email or phone | Later |
| POST | `/me/kyc` | Bearer | **P2** (FR-05) Mock KYC document | Later |

**Phone OTP design (FR-02):** the code is stored hashed in Redis under the user id with a 5-minute expiry and an attempt counter; 5 wrong codes lock verification for 15 minutes; resend after 30 seconds. The phone is saved on the user only after a correct code, so `users.phone` (unique, nullable) only ever holds verified numbers. A number already verified by another account → `409 PHONE_TAKEN`.

**Booking gate:** `POST /bookings` returns `403 PHONE_NOT_VERIFIED` until `phoneVerified` is true, so the web and app send the renter to add their phone first.

## Catalogue — MVP

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/categories` | — | Active groups with their categories and `specSchema`. Cached in Redis for 1 hour |

## Items — MVP (FR-06 to FR-12)

### Browsing

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/items` | — | Search and filter |
| GET | `/items/:idOrSlug` | — | Item detail |
| GET | `/items/:id/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` | — | Booked and blocked ranges, for the calendar |
| POST | `/items/:id/quote` | — | Price for dates and handover; the same maths the server charges |

`GET /items` query parameters:

| Param | Example | Notes |
| --- | --- | --- |
| `q` | `ps5` | Full-text on title and description |
| `group`, `category` | `electronics`, `cameras` | Slugs |
| `from`, `to` | `2026-12-12`, `2026-12-14` | Both or neither. Leaves out items booked or blocked then, and adds `quote` to each result |
| `delivery` | `true` | Only items that deliver |
| `maxPricePaise` | `80000` | 1-day rate cap |
| `near` | `23.03,72.51` | lat,lng. **P2** (FR-12); MVP uses `area` |
| `radiusKm` | `5` | With `near` |
| `sort` | `recommended` · `price` · `distance` · `rating` · `newest` | |
| `limit`, `cursor` | | Pagination |

Search result item (the shape the web `ItemCard` needs):

```json
{
  "id": "…", "slug": "ps5-2-controllers-3f9a", "title": "PS5 + 2 controllers",
  "category": { "slug": "gaming", "name": "Gaming" },
  "coverPhotoUrl": "https://cdn.rentxplay.in/items/…/0.webp",
  "pricesPaise": { "oneDay": 50000, "threePlus": 40000, "sevenPlus": 30000 },
  "deliveryFeePaise": 10000,
  "area": "Satellite", "distanceKm": 2.1,
  "rating": 4.8, "reviewCount": 31, "popular": true,
  "quote": { "days": 3, "ratePaise": 40000, "rentPaise": 120000 }
}
```

`GET /items/:idOrSlug` adds: `description`, `inTheBox`, `condition`, `specs`, all photo URLs, `depositPaise`, `deliveryRadiusKm`, `minDays`, `maxDays`, `owner` (public profile), `rulesNote`, and the first 5 reviews. It never returns `location` or `pickupInstructions`.

`POST /items/:id/quote`

```json
// request
{ "from": "2026-12-10", "to": "2026-12-13", "handover": "delivery", "addressId": "…" }

// 200 response
{ "days": 3, "ratePaise": 40000, "rentPaise": 120000, "serviceFeePaise": 12000,
  "deliveryFeePaise": 10000, "depositPaise": 500000, "totalPaise": 642000 }
```

Errors: `409 dates_taken`, `422 below_min_days` / `ABOVE_MAX_DAYS`, `422 outside_delivery_radius`, `422 delivery_not_offered`.

### Owner's listings

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/me/items` | Bearer | Your listings with status |
| POST | `/items` | Bearer | Create a listing (MVP: `live` at once; P2: `pending_review`) |
| PATCH | `/items/:id` | Owner | Edit. Price changes never affect existing bookings |
| POST | `/items/:id/pause` · `/resume` | Owner | Hide or show without deleting |
| DELETE | `/items/:id` | Owner | Soft delete; refused with `409 has_active_bookings` if any are active |
| POST | `/uploads/item-photos` | Bearer | Get pre-signed S3 PUT URLs: `{ "count": 3, "contentTypes": ["image/jpeg", …] }` → `[{ "uploadUrl", "s3Key" }]` |
| PUT | `/items/:id/photos` | Owner | Set photos and order from uploaded `s3Key`s (3–8) |
| GET | `/items/:id/blocks` · POST · DELETE `/:blockId` | Owner | Block or unblock dates (FR-08) |

Create request body: `title`, `categoryId`, `description`, `inTheBox[]`, `condition`, `specs` (checked against the category's `specSchema`), `pricesPaise { oneDay, threePlus, sevenPlus }`, `depositPaise`, `delivery { feePaise, radiusKm } | null`, `minDays`, `maxDays`, `area`, `location { lat, lng }`, `pickupInstructions`.

## Bookings — MVP (FR-14 to FR-17)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/bookings` | Bearer + `Idempotency-Key` | Request a booking |
| GET | `/me/bookings?role=renter&tab=upcoming` | Bearer | Renter tabs: `requested`, `upcoming`, `active`, `past` |
| GET | `/me/bookings?role=owner&tab=requests` | Bearer | Owner tabs: `requests`, `upcoming`, `active`, `past` |
| GET | `/bookings/:id` | Renter or owner | Detail: item, other person, price snapshot, status timeline, allowed actions |
| POST | `/bookings/:id/approve` | Owner | `requested → approved`, starts the 30-minute payment window |
| POST | `/bookings/:id/reject` | Owner | `requested → rejected` (optional `reason`) |
| POST | `/bookings/:id/cancel` | Renter or owner | Cancel with refund rules |
| POST | `/bookings/:id/pickup` | Renter or owner | Log pickup photos; when both have confirmed, `paid → picked_up` |
| POST | `/bookings/:id/return` | Renter or owner | Log return photos; `picked_up → returned`, late fee calculated |
| POST | `/bookings/:id/complete` | Owner | Condition OK: `returned → completed`, deposit refund queued |

`POST /bookings`

```json
// request
{ "itemId": "…", "from": "2026-12-10", "to": "2026-12-13", "handover": "delivery", "addressId": "…" }

// 201 response
{ "id": "…", "code": "RX-1042", "status": "requested", "expiresAt": "2026-12-02T10:00:00Z",
  "quote": { "days": 3, "ratePaise": 40000, "rentPaise": 120000, "serviceFeePaise": 12000,
             "deliveryFeePaise": 10000, "depositPaise": 500000, "totalPaise": 642000 } }
```

Server checks, in order: phone verified (`403 phone_not_verified`), not your own item, item `live`, pickup date not before today (Asia/Kolkata), dates valid and within min/max days, not overlapping blocked or active bookings, delivery address within radius. The price is computed on the server and copied to the booking; anything the client sends about price is ignored.

### Allowed actions

`GET /bookings/:id` returns `allowedActions` (for example `["approve", "reject"]`), so the app shows only buttons that will work. Every action endpoint returns the updated booking, or `409 invalid_transition` if the status has moved on.

| Action | Who | From → to | Side effects |
| --- | --- | --- | --- |
| approve | Owner | requested → approved | Locks the item row, checks blocks; overlap → `409 dates_taken`. Other `requested` bookings that now overlap are moved to `expired` with the note "dates taken". Notifies renter; payment due in 30 min |
| reject | Owner | requested → rejected | Notifies renter |
| cancel (renter) | Renter | requested/approved → cancelled | No charge yet, nothing to refund |
| cancel (renter) | Renter | paid → cancelled | Rent refund: 100% if more than 48 h before pickup, 50% for 24–48 h, 0% under 24 h. Fees follow the rent; deposit always refunded |
| cancel (owner) | Owner | approved/paid → cancelled | Full refund to renter; owner gets a strike |
| pickup | Both | paid → picked_up | Needs pickup photos from each side |
| return | Both | picked_up → returned | Late fee = 1.5 × 1-day rate per extra day, taken from the deposit |
| complete | Owner | returned → completed | Queues deposit refund (minus late fee) |
| dispute | Both | returned → disputed | Within 48 h of return (see Trust) |

## Payments — MVP (FR-19 to FR-21)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/bookings/:id/payments` | Renter + `Idempotency-Key` | Create a Razorpay order for `totalPaise`; only while `approved` and before `expiresAt` |
| POST | `/payments/verify` | Renter | Checkout callback: verify the signature, show "paid" at once |
| POST | `/webhooks/razorpay` | Razorpay signature | Source of truth for payment and refund status |
| GET | `/bookings/:id/payments` | Renter or owner | Charges and refunds for the booking |

`POST /bookings/:id/payments` → `201 { "paymentId", "razorpayOrderId", "amountPaise", "currency": "INR", "keyId": "rzp_test_…" }`. The client opens Razorpay Checkout with these.

**Webhook handling:**

1. Verify `X-Razorpay-Signature` with the webhook secret over the **raw** body (this route is mounted before `express.json()`).
2. Insert into `webhook_events` by Razorpay's event id; a duplicate means already handled → `200`.
3. In one transaction: update `payments`, and on `payment.captured` move the booking `approved → paid` (or, if it already expired, queue an automatic full refund).
4. Always answer `200` quickly; slow work goes to a queue.

Test mode only until launch: `rzp_test_` keys, no live keys in any environment file.

## Trust — MVP and P2

| Method | Path | Auth | Phase | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/uploads/handover-photos` | Renter or owner | MVP | Pre-signed URLs for pickup/return photos |
| POST | `/bookings/:id/reviews` | Renter or owner | MVP | One review each way after `completed`: `{ "rating": 5, "text": "…" }` |
| GET | `/items/:id/reviews` · `/users/:id/reviews` | — | MVP | Paginated |
| POST | `/bookings/:id/dispute` | Renter or owner | P2 | `{ "reason", "claimPaise", "photoKeys": [] }`, within 48 h of return |
| GET | `/me/earnings` | Owner | P2 | Rent earned, commission, payouts (FR-22) |

## Chat and notifications — P2 (FR-26 to FR-28)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/bookings/:id/messages?cursor=` | Renter or owner | Chat history |
| POST | `/bookings/:id/messages` | Renter or owner | Send a message (also emitted on the socket) |
| GET | `/me/notifications` | Bearer | In-app list |
| POST | `/me/notifications/read` | Bearer | Mark some or all as read |
| POST | `/me/push-tokens` | Bearer | Register an FCM token for the Flutter app |

**Socket.io** (`/realtime`, authenticated with the access token in the handshake):

| Event | Direction | Payload |
| --- | --- | --- |
| `booking:join` | client → server | `{ bookingId }`; only the renter and owner may join |
| `message:new` | server → client | The new message |
| `booking:updated` | server → client | `{ bookingId, status }` after any transition |
| `notification:new` | server → client | The new notification |

Redis adapter so several API instances share rooms.

## Admin — P2 (FR-09, FR-25, FR-29)

All under `/admin`, role `admin` only.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/stats` | Counts of users, live listings, bookings by status, revenue |
| GET | `/admin/items?status=pending_review` | Moderation queue |
| POST | `/admin/items/:id/approve` · `/reject` | `{ "reason" }` on reject |
| GET | `/admin/kyc?status=pending` · POST `/admin/kyc/:userId/approve` · `/reject` | Mock KYC |
| GET | `/admin/disputes?status=open` · POST `/admin/disputes/:id/resolve` | `{ "ownerKeepsPaise", "note" }` → booking `completed`, refund the rest |
| POST | `/admin/users/:id/block` · `/unblock` | Blocking pauses listings and cancels open requests |

## Background jobs (BullMQ on Redis)

| Job | When | Does |
| --- | --- | --- |
| `booking.expireRequest` | `requested` + 24 h | → `expired`, notify renter |
| `booking.expirePayment` | `approved` + 30 min | → `expired`, dates freed, notify both |
| `booking.returnReminder` | 24 h and 2 h before `end_date` | Push + email to renter |
| `booking.autoComplete` | `returned` + 48 h with no dispute | → `completed`, refund deposit |
| `payment.refund` | On cancel, complete, dispute resolve | Calls Razorpay refunds API with an idempotency key; retried 3 times with backoff |
| `notify.send` | Any notification | Email (Nodemailer/SES) and FCM push |

Jobs carry the booking's status at the time they were scheduled and do nothing if it has changed since, so a late job can never undo a newer action.

## Health and docs

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness (already built) |
| GET | `/health/ready` | Database and Redis reachable |
| GET | `/api/v1/docs` | Swagger UI from the OpenAPI spec generated from the Zod schemas (non-production only) |

## Module layout

```
src/modules/<module>/
  <module>.routes.ts      Express router, mounts under /api/v1
  <module>.schemas.ts     Zod request and response schemas (feed OpenAPI)
  <module>.service.ts     business logic, transactions
  <module>.repository.ts  Prisma queries
src/lib/pricing.ts        rentalDays, dayRate, quote (mirrors the web repo, ADR 0003)
src/lib/booking-state.ts  allowed transitions + transitionBooking()
src/jobs/                 BullMQ queues and workers
```

## Build order

1. Prisma schema + SQL migration (constraints, PostGIS) + seed.
2. Auth and `/me` → web login and signup switch from the demo cookie to the API.
3. Categories and items (browse, detail, quote) → web search and item pages read from the API.
4. Bookings + approve/reject + expiry jobs.
5. Payments (Razorpay test) + webhook + refunds.
6. Handover photos and reviews. Then Phase 2.
