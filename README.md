# Growth Space

Growth Space currently contains the full-stack foundation and a system health check connecting a React frontend, FastAPI backend, and PostgreSQL database.

## Prerequisites

- Node.js 20.19+ or 22.12+
- Python 3.12+
- PostgreSQL with an empty database and a user that can connect to it

## Backend setup

From the repository root:

```powershell
cd apps/api
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `apps/api/.env` and replace the placeholder values with your local PostgreSQL connection details. The URL must use SQLAlchemy's Psycopg driver format:

```dotenv
DATABASE_URL=postgresql+psycopg://growthspace_user:your-password@localhost:5432/growthspace
JWT_SECRET=replace-this-with-a-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

Generate a JWT secret locally, then place the result in `JWT_SECRET` (do not
commit the real value):

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`ACCESS_TOKEN_EXPIRE_MINUTES` controls how long a login token remains valid and
must be between 1 and 1440 minutes.

Apply all database migrations:

```powershell
alembic upgrade head
```

Create a new migration after changing the SQLAlchemy models:

```powershell
alembic revision --autogenerate -m "describe the schema change"
alembic upgrade head
```

Roll back the most recent migration with:

```powershell
alembic downgrade -1
```

The initial migration creates the `users` table. It stores only `password_hash`;
plain-text passwords must never be stored in the database.

## Authentication setup

After applying migrations and starting the API, send a JSON request containing
`username` and `password` to `POST /api/auth/setup`. This route creates the sole
account only while the `users` table is empty; later setup attempts return HTTP
409. Usernames are 3-50 characters and may contain letters, numbers, `_`, `-`,
and `.`. Passwords must be 12-128 characters and include uppercase, lowercase,
a number, and a symbol.

`POST /api/auth/login` accepts the same JSON field names and returns a signed,
expiring Bearer token. Supply it as `Authorization: Bearer <token>` when calling
`GET /api/auth/me`. API responses never include the password or its Argon2 hash.

Start the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

Run backend tests:

```powershell
python -m pytest -q
```

## Frontend setup

In another terminal, from the repository root:

```powershell
cd apps/web
npm install
npm run dev
```

Open <http://localhost:5173>. The frontend requests the health status from <http://localhost:8000/api/health>.

Create a production build with:

```powershell
npm run build
```

## Health check

`GET /api/health` asks PostgreSQL to execute `SELECT 1`. When both services are available it returns:

```json
{
  "api": "connected",
  "database": "connected"
}
```

If PostgreSQL cannot be reached, the API returns HTTP 503 with a safe message that does not expose credentials or connection details.
