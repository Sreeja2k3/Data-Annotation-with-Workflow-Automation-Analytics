FROM python:3.11-slim

WORKDIR /app

# Install build & runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source and seed scripts
COPY backend /app/backend
COPY sample_data /app/sample_data
COPY verify.py /app/verify.py

ENV PYTHONPATH=/app
ENV DATABASE_URL=sqlite:///./annotation_ops.db
ENV SECRET_KEY=enterprise-super-secret-jwt-signing-key-production-ready-2026
ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV ENVIRONMENT=production

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/docs || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
