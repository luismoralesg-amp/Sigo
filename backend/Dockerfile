# Imagen del API SIGO.
# Access (.accdb / .mdb) lo lee el módulo de importación con mdbtools.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends mdbtools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

ENV SIGO_ENV=demo \
    SIGO_DEV_LOGIN=false

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
