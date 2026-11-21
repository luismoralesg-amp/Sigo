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

# CORS por defecto del código también cubre estos orígenes y el regex del túnel
# (https://*.trycloudflare.com) si SIGO_CORS_ORIGIN_REGEX no se define.
ENV SIGO_ENV=demo \
    SIGO_DEV_LOGIN=false \
    SIGO_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://sigo.vercel.app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
