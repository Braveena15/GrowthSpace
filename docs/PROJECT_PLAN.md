#Growth Space

## Purpose 
Growth Space is private system for planning activities, recording daily progress, writing journal entries and reviewing weekly improvement. 

## First Feature: System Health Check

The first feature will verify that the React frontend, Fast API backend and PostgreSQL database can communicate. 

## Acceptance Criteria 

- React starts successfully.
- FastAPI starts successfully. 
- FastAPI connects to PostgreSQL
- GET /api/health returns status code 200. 
- React displays the API and database status. 
- Database credentials are stored in .env.
- .env is not committed to Github.
- No login, planner or journal functionality is added yet. 

### Feature: User database foundation

The system must store the account required for accessing GrowthSpace.

Acceptance criteria:

- A users table exists in PostgreSQL.
- Every user has an ID and unique username.
- Passwords are never stored as plain text.
- The table records when the account was created.
- Alembic can create and reverse the database change.
- Existing health-check functionality continues working.

### Feature: Account setup and login API

- The first user can create the personal GrowthSpace account.
- A second account cannot be created through the setup endpoint.
- Passwords are hashed with Argon2 before database storage.
- Plain-text passwords are never returned or logged.
- Correct credentials return a temporary JWT access token.
- Incorrect username and password responses use the same generic message.
- An inactive account cannot log in.
- A protected /api/auth/me endpoint returns the authenticated user.
- Missing, invalid or expired tokens return HTTP 401.
- The JWT secret is loaded from .env and never committed.
- Existing health checks and user-model tests continue passing.

### Feature: Frontend login

- Unauthenticated users see only the login screen.
- The user can enter a username and password.
- React sends the credentials to POST /api/auth/login.
- The password is never displayed, logged or stored.
- Successful login returns an access token.
- React validates the token using GET /api/auth/me.
- A successful login opens a protected home placeholder.
- Invalid credentials show a generic error.
- The submit button shows a loading state.
- Logout clears the token and returns to the login screen.
- The token remains only in React memory.
- Existing backend and frontend functionality continues working.