# RecordWise

RecordWise is a barangay records and service workflow platform with separate resident and secretary workspaces. It handles document requests, community reports, archive uploads, activity logs, and tamper-evident record hashes for archived files.

## Features

- Resident document requests with queue tracking and status timelines
- Community problem reporting with evidence uploads
- Secretary request ownership and processing workflow
- Searchable activity logs and archive records with CSV export
- Archive verification by record hash
- Resident notifications for pickup-ready requests
- Multi-factor authentication, captcha login, and session timeout handling

## Frontend

- React 19
- TypeScript
- Vite
- React Router

## Backend

- FastAPI
- MongoDB
- JWT authentication
- TOTP-based MFA

## Local Development

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
cd Backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Environment Notes

Backend configuration is loaded from `Backend/.env`.

Important values:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `MAX_UPLOAD_SIZE_BYTES`

Default upload limit is 10 MB.
