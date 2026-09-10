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
```

Start the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

Run backend tests:

```powershell
python -m pytest
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

