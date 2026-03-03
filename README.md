# AI File Helper (aifilehelper)

AI File Helper is a lightweight document assistant for production teams. It makes files in a codebase quickly searchable and combines retrieval with AI guidance to help users understand search results and take action. The project is flexible and can be integrated with Bot Agents or other AI agent systems for business automation.

## Key features

- Fast keyword-based and RAG-style search across repository files
- AI summarization and per-document evaluations for retrieved results
- Connects to Bot Agents and external AI systems for automation workflows
- Configurable and tailor-made deployment options for enterprise needs

## What to keep out of the repo

The following folders are intentionally excluded from the repository to avoid committing large binary/DB or local test data:

- `testsearchfiles/` (local source corpus used for indexing)
- `dochelper_chroma_testsearchfiles/` (persisted Chroma vector DB)
- `backup_removed/` (archived local backups)

These are listed in `.gitignore` so they won't be pushed.

## Quick start

1. Create a Python virtual environment and install dependencies (adjust as needed):

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt  # if you maintain one
```

2. Build the vector DB (optional) from your local `testsearchfiles`:

```bash
# start the app and then call the /study endpoint, or run your indexing script
python check.py
# then in another shell
curl http://127.0.0.1:8009/study
```

3. Search and ask:

```bash
# Search endpoint
curl "http://127.0.0.1:8009/check/outputview"
# RAG endpoint
curl "http://127.0.0.1:8009/ask/outputview"
```

## Push to your GitHub repository

Run these commands from the project root (replace with your remote URL):

```bash
git init
git add .
git commit -m "Initial commit: aifilehelper"
git branch -M main
git remote add origin https://github.com/maxmakhk/aifilehelper.git
git push -u origin main
```

Note: `.gitignore` already excludes `testsearchfiles/`, `dochelper_chroma_testsearchfiles/`, and `backup_removed/`.

## Contact

If you'd like to collaborate or have this tailored for your organization, please open an issue or contact me via GitHub.
