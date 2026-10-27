# Multi-stage Dockerfile for DigiTwin Full-Stack (Frontend + Backend in One Service)

# Step 1: Build the React + Vite frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY digitwin-healthcare/frontend/package*.json ./
RUN npm install
COPY digitwin-healthcare/frontend/ ./
RUN npm run build

# Step 2: Python runtime serving both APIs and the built frontend
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY digitwin-healthcare/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY digitwin-healthcare/backend/ ./

# Copy compiled frontend assets
COPY --from=frontend-builder /build/dist /app/frontend/dist

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
