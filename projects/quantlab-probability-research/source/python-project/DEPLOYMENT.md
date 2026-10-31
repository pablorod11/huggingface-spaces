# Deploy QuantLab to Hugging Face Spaces

This package is prepared for deployment; this document does not assert that a Space has been created or published. The destination account, repository and visibility must be selected by the owner. Documentation checked 25 October 2026 using official sources. Local Napolean search was unavailable, so host web retrieval was used.

## Root layout and configuration

Upload the **contents** of `quantlab-space` into the Space repository root. Do not upload its parent folder or a ZIP as the application. `README.md`, `app.py` and `requirements.txt` must be at the repository root; keep companion Python modules beside `app.py` and preserve any asset subdirectories.

Hugging Face reads the YAML front matter at the top of root `README.md`. It must identify `sdk: gradio`, `app_file: app.py`, and the exact `sdk_version` shipped and tested with this package. Keep its Python version aligned with the dependency environment. Do not replace the tested SDK pin with an arbitrary latest version. The Python `gradio` dependency and README SDK version must agree. See the [official configuration reference](https://huggingface.co/docs/hub/spaces-config-reference).

The Gradio runtime installs root `requirements.txt` and runs the selected application file. `suggested_hardware` is only a recommendation, not a hardware allocation. CPU is the initial deployment target; assess memory and latency with representative uploads before choosing paid resources. See [Gradio Spaces](https://huggingface.co/docs/hub/spaces-sdks-gradio).

## Account-specific deployment blocker

On 25 October 2026, the authenticated `PabloRod11` creation form showed Gradio and Docker disabled behind a paid plan, with only Static Spaces available. A new public Gradio deployment was therefore not created. The intended target is `PabloRod11/quantlab-probability-research`. The user must enable an eligible plan or explicitly choose a separately scoped static implementation. No subscription or paid hardware was purchased. Do not assume CPU Gradio creation is free for this account.

## Browser upload

1. Sign in to Hugging Face and open [Create a Space](https://huggingface.co/new-space).
2. Choose the owning account/organization, repository name and visibility. Select Gradio as SDK and CPU hardware initially.
3. Open the new repository's **Files** tab and upload all application package contents to its root. Include the supplied README and requirements; exclude `.venv`, `__pycache__`, `.git`, local datasets, temporary outputs, credentials and experiment stores.
4. Commit the files. Open build logs and confirm dependencies install and the app starts. A local import is not proof that the hosted Linux build succeeds.
5. In the **App** tab, run the synthetic example, then a small valid CSV. Check probabilities, charts, validation errors and downloadable artifacts. Confirm optional unavailable models are reported honestly.
6. Retest with two separate browser sessions. Confirm each sees its own run outputs and that no shared temporary export or MLflow state leaks between runs. Download needed results before the runtime or cache is cleared.

## Optional authenticated Python upload

Use this only after selecting the intended destination. This writes to that external repository when executed. Authenticate locally with the Hugging Face SDK's supported login flow; do not put tokens in this file, command history, notebook, app source or uploaded CSV. The app itself needs no Hub token to perform local probability experiments.

```python
from huggingface_hub import HfApi, login

login()  # Interactive authentication on your own machine.
api = HfApi()
repo_id = "YOUR_ACCOUNT/YOUR_SPACE"  # Replace intentionally.
api.create_repo(
    repo_id=repo_id,
    repo_type="space",
    space_sdk="gradio",
    private=True,
    exist_ok=True,
)
api.upload_folder(
    repo_id=repo_id,
    repo_type="space",
    folder_path="/ABSOLUTE/PATH/TO/quantlab-space",
    path_in_repo=".",
    ignore_patterns=[
        "**/__pycache__/**", "**/*.pyc", ".venv/**", ".git/**",
        ".env", ".env.*", "mlruns/**", "*.db", "*.sqlite*",
        "tmp/**", "work/**", "uploads/**",
    ],
    commit_message="Deploy QuantLab research application",
)
```

Review the directory before uploading: ignore patterns are not a secret scanner. `exist_ok=True` does not change an existing repository's visibility; check that separately. Uploading does not delete stale remote files. The [official upload guide](https://huggingface.co/docs/huggingface_hub/guides/upload) documents folder uploads, `repo_type="space"`, and allow/ignore filters. For command-line deployment, consult the installed version's help and the [official Hub CLI guide](https://huggingface.co/docs/huggingface_hub/guides/cli); no CLI command was executed in preparing this document.

## Data handling and retention

Uploaded CSVs are sent to and processed on the application server. Local previewing does not make a hosted upload stay on the user's computer. Upload only market data that you are authorized to process there; never upload credentials. The supported input is data, not executable Python, pickle/joblib models, arbitrary URLs or user-supplied code.

The intended lifecycle is bounded uploads, per-run temporary outputs, temporary local MLflow stores, and Gradio cache cleanup. Downloadable metadata is an export of the current run, not a persistent cross-session experiment history. Cleanup is eventual; do not promise immediate deletion of every server cache, backup or platform log. Deployment acceptance must check configured file size/row limits, per-run filenames, cleanup policy and file-serving restrictions against the actual installed Gradio version.

Do not broaden Gradio file access to the whole repository, home directory or filesystem. Do not expose a tracking server or remote MLflow URI through user input. Configure any future service credentials through Space settings rather than committed files.

Hugging Face's current [configuration reference](https://huggingface.co/docs/hub/spaces-config-reference) says the older persistent-storage setting is ignored. This application therefore makes no retention guarantee across restart, rebuild, sleep or cleanup. Persistent shared history would require a separately designed authenticated service and retention policy.

## Verification boundaries

The Gradio 6 migration and file-access guides were requested from their official URLs, but this research tool could not fetch their redirected markdown endpoints. References: [migration guide](https://www.gradio.app/guides/gradio-6-migration-guide), [file access](https://www.gradio.app/guides/file-access). Their contents are not claimed as inspected. SDK compatibility, cleanup parameters and launch options must be verified against installed Gradio 6 signatures and local smoke tests, followed by a hosted build. Consult the delivered verification report for actual executed checks; this deployment guide makes no test-pass claim.
