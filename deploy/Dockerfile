FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY cortex/ ./cortex/

RUN pip install --no-cache-dir -e ".[cpu]"

EXPOSE 7432
