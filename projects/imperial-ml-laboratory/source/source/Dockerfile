FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=1 \
    DEMO_READ_ONLY=true \
    DEMO_RUNS_DIR=/app/reference/runs \
    DEMO_ACTIVE_MODEL=/app/reference/active-model.json \
    MODEL_CHECKPOINT=/app/reference/runs/00000000000000000000000000000001/checkpoint.pt
WORKDIR /app
RUN python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu \
    && useradd --uid 1000 --create-home ml \
    && mkdir -p /app/artifacts /app/reference \
    && chown ml:ml /app/artifacts /app/reference
COPY --chown=ml:ml . .
RUN python -m pip install '.[test]'
USER ml
# Bundle a real model so the public image serves predictions on first startup.
RUN python bootstrap_reference.py
EXPOSE 7860
CMD ["python", "-m", "uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "7860"]
