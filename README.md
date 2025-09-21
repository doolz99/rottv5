# rot.tv5

Minimal anonymous tag-based random chat (Omegle-like) built with FastAPI (Python) + vanilla JS.

## Features
- Random or tag-based pairing (OR logic: at least one matching tag).
- Live keystroke preview (ghost typing text).
- Dynamic font scaling: shorter messages appear larger.
- Skip, leave, ESC to exit.
- Ephemeral in-memory sessions (no persistence).

## Project Structure
```
backend/       FastAPI app (WebSocket endpoint at /ws)
frontend/      Static HTML/CSS/JS (index, home, chat)
docs/          Protocol documentation
```

## Requirements
Python 3.11+ recommended.

## Install & Run (Dev)
```powershell
cd rot.tv5
python -m venv .venv
. .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```
Then visit: http://localhost:8000/

Static assets are served from `/static` and pages:
- Gate: `/`
- Home: `/home`
- Chat: `/chat`

## TODO / Future Enhancements
- Production static serving & build pipeline.
- Redis-based queue for scale.
- Moderation / rate limiting.
- Single-sided video (WebRTC) upgrade path.
- Automated tests.

## License
MIT (add file if needed).
