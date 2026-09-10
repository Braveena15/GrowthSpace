from typing import Literal

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_engine


class HealthResponse(BaseModel):
    api: Literal["connected"]
    database: Literal["connected"]


app = FastAPI(title="Growth Space API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health(engine: Engine = Depends(get_engine)) -> HealthResponse | JSONResponse:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content={
                "api": "connected",
                "database": "unavailable",
                "message": "Database connection unavailable.",
            },
        )

    return HealthResponse(api="connected", database="connected")

