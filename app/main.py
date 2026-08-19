from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from .api import router
from .database import Base, engine


app = FastAPI(
    title="Annotation Platform — Core Workflow Engine",
    description="Data annotation platform with project, dataset, import, and workflow APIs.",
)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        openapi_version="3.0.3",
    )

    # FastAPI/Pydantic can describe UploadFile array items with
    # contentMediaType. Swagger UI expects the OpenAPI 3.0 binary form.
    schemas = openapi_schema.get("components", {}).get("schemas", {})
    for schema in schemas.values():
        for name, prop in schema.get("properties", {}).items():

            # Fix single file upload
            if name == "file":
                prop["type"] = "string"
                prop["format"] = "binary"

            # Fix multiple file upload
            if prop.get("type") == "array":
                items = prop.get("items", {})
                if items.get("contentMediaType"):
                    items["format"] = "binary"
                    items.pop("contentMediaType", None)

    app.openapi_schema = openapi_schema
    return openapi_schema


app.openapi = custom_openapi

# Development convenience. Production deployments should use migrations.
Base.metadata.create_all(bind=engine)

app.include_router(router, prefix="/api/v1", tags=["workflow"])


@app.get("/health")
def health():
    return {"status": "ok"}
