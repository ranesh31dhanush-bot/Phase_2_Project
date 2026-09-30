# Production Auth Microservice

A containerized authentication service built with Node.js, Express, MongoDB, Redis, and Docker. It provides JWT-based authentication, refresh-token rotation, password reset, email verification, and Google OAuth support.

## Features

- JWT access tokens and refresh cookies
- Refresh token storage and invalidation in Redis
- Email verification flow
- Password reset flow
- Google OAuth authentication
- Dockerized API + worker + MongoDB + Redis setup
- Jest + Supertest integration testing

## Tech Stack

- Node.js
- Express.js
- MongoDB + Mongoose
- Redis
- BullMQ
- Nodemailer + Mailtrap
- Docker + Docker Compose
- Jest + Supertest

## Project Structure

```text
Phase_2_Project/
├── config/             # Redis, BullMQ, OAuth, mailer, and DB config
├── controller/         # Auth and user logic
├── middleware/         # Route guards and auth middleware
├── models/             # Mongoose schemas
├── queues/             # Queue producers and job definitions
├── routes/             # Express route declarations
├── tests/              # Integration tests
├── workers/            # Background worker processes
├── .env                # Local environment config
├── .env.example        # Sample environment variables
├── .gitignore
├── api.http            # API samples for VS Code REST client
├── app.js              # Express app setup
├── docker-compose.yml  # Docker services configuration
├── Dockerfile          # Container build config
├── package.json        # Project scripts and dependencies
├── server.js           # App bootstrap and MongoDB connection
├── README.md           # Project documentation
└── ...
```

## Prerequisites

Before running the project, make sure you have:

- Node.js 18+ or 20+
- Docker Desktop / Docker Engine
- npm

## Environment Configuration

Create a `.env` file in the project root based on `.env.example`:

```bash
cp .env.example .env
```

Example:

```env
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

# Database
MONGO_URI=mongodb://127.0.0.1:27017/Phase_2_project
REDIS_URL=redis://127.0.0.1:6380

# JWT
JWT_ACCESS_SECRET=your_jwt_access_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Mailtrap
MAIL_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your_mailtrap_user
MAIL_PASS=your_mailtrap_password
MAIL_FROM="Auth System <no-reply@authsystem.com>"

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

> For local Docker-based development, use `127.0.0.1` instead of `localhost` for MongoDB connections whenever the service is running in a container.

## Running the Project

### Option 1: Docker Compose

```bash
docker compose up --build -d
```

This starts:

- MongoDB on port `27017`
- Redis on port `6380`
- API on port `3000`
- Background worker for email processing

Check status:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f api
docker compose logs -f worker
```

Stop services:

```bash
docker compose down
```

### Option 2: Local Development

```bash
npm install
npm run dev
```

The app starts on:

```text
http://localhost:3000
```

## Authentication Routes

| Method | Endpoint | Description | Auth |
| --- | --- | --- | --- |
| POST | `/auth/register` | Register a new user | No |
| POST | `/auth/login` | Login a user and issue access token | No |
| POST | `/auth/refresh` | Refresh access token using cookie | Yes |
| POST | `/auth/logout` | Clear refresh token and cookie | Yes |
| GET | `/auth/verify/:token` | Verify email using token | No |
| POST | `/auth/forgot-password` | Request reset link | No |
| POST | `/auth/reset-password` | Reset password with token | No |
| GET | `/auth/google` | Start Google OAuth flow | No |
| GET | `/auth/google/callback` | Handle OAuth callback | No |
| GET | `/user/profile` | Get authenticated user profile | Yes |

## Example API Calls

### Register User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@example.com","password":"Password123!"}'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"alex@example.com","password":"Password123!"}'
```

### Access Protected Route

```bash
curl -X GET http://localhost:3000/user/profile \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

### Refresh Token

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -b cookies.txt
```

### Forgot Password

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@example.com"}'
```

### Reset Password

```bash
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<RAW_TOKEN_FROM_EMAIL>","newPassword":"NewSecurePassword456!"}'
```

### Logout

```bash
curl -X POST http://localhost:3000/auth/logout \
  -b cookies.txt \
  -c cookies.txt
```

## Testing

Run the test suite:

```bash
npm test
```

The project includes integration tests for:

- user registration
- duplicate email handling
- email verification
- login flow
- refresh and logout lifecycle
- password reset flow
- Google OAuth flow

## Notes

- Refresh tokens are stored server-side and hashed before use.
- Access tokens are short-lived for security.
- Cookies are set as `HttpOnly` and `SameSite=Strict`.
- Email jobs are processed asynchronously in the background worker.
- For production, store secrets in a secure environment manager rather than committing them to source control.

## License

This project is for internal or educational use unless otherwise specified by the project owner.