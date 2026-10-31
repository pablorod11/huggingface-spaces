# Prepare a Hugging Face Docker Space

The project is prepared for an inference-only Docker Space; it has not been uploaded or deployed. The image trains its bundled reference model at build time, starts FastAPI on port 7860, and disables training/promote endpoints by default through `DEMO_READ_ONLY=true`.

1. Validate the supported Linux container locally with `docker build -t distributed-ml-foundation:local .` and `docker run --rm distributed-ml-foundation:local python -m unittest -v`.
2. Smoke-test public mode with `docker run --rm -p 127.0.0.1:7860:7860 distributed-ml-foundation:local`. Open http://localhost:7860, confirm predictions and readiness, and confirm training/promote controls are disabled.
3. Create a Docker Space under your own Hugging Face account. Keep the README YAML metadata and Dockerfile at that repository's root. Do not set `DEMO_READ_ONLY=false` on a public Space.
4. Upload the source after authenticating through your own CLI or SDK. The following template requires your real Space repository ID; it intentionally contains no token or invented account URL:

```sh
python -m pip install huggingface_hub
python - <<'PY'
from huggingface_hub import HfApi
HfApi().upload_folder(
    repo_id="YOUR_ACCOUNT/YOUR_SPACE",
    repo_type="space",
    folder_path=".",
    ignore_patterns=[".venv/**", ".git/**", "__pycache__/**", "artifacts/**", "reference/**", "*.egg-info/**"],
)
PY
```

Run the upload from this project directory after replacing the repository ID and using your normal authentication mechanism. Publishing requires that account and authorization; no upload has been run here.

The reference artifact stays in the image under `/app/reference/runs/00000000000000000000000000000001/checkpoint.pt`; runtime state uses `/app/artifacts`. Space writable storage can disappear when the container restarts, so public demo state is not a durable model registry. See the official [Docker Spaces guide](https://huggingface.co/docs/hub/spaces-sdks-docker) and [configuration reference](https://huggingface.co/docs/hub/spaces-config-reference).
