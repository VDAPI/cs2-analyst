# The win-probability trainer service (S14). Built from the repo root so the
# shipped prior (src/lib/winprob/prior-model.json) is the same file the app uses:
#   docker compose up -d ml
FROM python:3.12-slim

# LightGBM needs OpenMP at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/ml
COPY ml/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY ml/cs2ml ./cs2ml
COPY src/lib/winprob/prior-model.json /app/src/lib/winprob/prior-model.json

ENV PORT=8765
EXPOSE 8765
CMD ["python", "-m", "cs2ml.server"]
