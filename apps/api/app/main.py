from typing import Literal

from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_engine
from app.routes.auth import router as auth_router
from app.routes.planner import router as planner_router
from app.routes.checkins import router as checkins_router
from app.routes.note_analysis import router as note_analysis_router


class HealthResponse(BaseModel):
    api: Literal["connected"]
    database: Literal["connected"]


app = FastAPI(title="Growth Space API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(planner_router)
app.include_router(checkins_router)
app.include_router(note_analysis_router)


@app.exception_handler(RequestValidationError)
async def safe_validation_error(
    request: Request,
    exception: RequestValidationError,
) -> JSONResponse:
    del request
    errors = [
        {key: value for key, value in error.items() if key != "input"}
        for error in exception.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder({"detail": errors}),
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
