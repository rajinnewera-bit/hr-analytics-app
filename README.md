# AI Finance Analyst HR Attendance Platform

This repository contains the production-ready source for the HR attendance and payroll application:

- `frontend/`: Next.js dashboard for uploads, HR review, summaries, payroll drilldowns, and processed attendance
- `backend/`: FastAPI API for upload, attendance processing, payroll calculations, HR regularization, and review workflows

The attendance, payroll, anomaly review, holiday, comp-off, and dashboard business logic live in the existing app code and are not changed by deployment setup.

## Folder Structure

```text
HR-Analytics-App/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
└── backend/
    ├── app/
    │   ├── routes/
    │   ├── config.py
    │   └── main.py
    ├── uploads/
    └── requirements.txt
```

## Local Development

### Step 1: Run the Backend

Open a terminal and run:

```bash
cd "/Users/rajdeepdutta/Desktop/Field Tracker/HR-Analytics-App"
python3 -m venv .venv
cd backend
source .venv/bin/activate
pip install -r requirements.txt
cd ..
./scripts/dev-backend.sh
```

When the backend is running, it will be available at:

```text
http://127.0.0.1:8000
```

### Step 2: Run the Frontend

Open a new terminal and run:

```bash
cd "/Users/rajdeepdutta/Desktop/Field Tracker/HR-Analytics-App/frontend"
cp .env.local.example .env.local
npm install
npm run dev
```

When the frontend is running, open:

```text
http://localhost:3001
```

### Step 3: Test the Upload

### Browser test

1. Open `http://localhost:3001`
2. Click the upload box
3. Choose a `.csv` or `.xlsx` file
4. Click `Upload File`
5. You should see a success message

### API test with curl

You can also test the backend directly:

```bash
curl -X POST "http://127.0.0.1:8000/upload" \
  -F "file=@/full/path/to/your-file.csv"
```

Example response:

```json
{
  "file_name": "your-file.csv",
  "file_type": "csv",
  "upload_status": "success",
  "message": "File uploaded and validated successfully."
}
```

## Production Deployment

### Frontend on Vercel

Deploy the `frontend/` directory as a Vercel project.

Required environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-backend-service.onrender.com
```

Recommended Vercel settings:

- Framework Preset: `Next.js`
- Root Directory: `frontend`
- Install Command: `npm install`
- Build Command: `npm run build`

### Backend on Render

Deploy the `backend/` directory as a Render web service, or use the root `render.yaml` blueprint.

Required environment variables:

```text
APP_ENV=production
CORS_ALLOW_ORIGINS=https://your-frontend-project.vercel.app
UPLOADS_DIR=/tmp/ai-finance-uploads
```

Render-compatible start command:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

The repository also includes:

- `backend/start.sh`
- `render.yaml`

### Production URL Format

- Frontend: `https://your-frontend-project.vercel.app`
- Backend: `https://your-backend-service.onrender.com`

## Frontend Notes

- The frontend uses Next.js and Tailwind CSS
- The upload form shows:
  - selected file name
  - loading state while uploading
  - success message
  - error message if something goes wrong

## Backend Notes

- The backend uses FastAPI
- CORS is environment-configurable for local, LAN, and production frontend URLs
- Uploaded files are stored in:

```text
/Users/rajdeepdutta/Desktop/Field Tracker/HR-Analytics-App/backend/uploads
```

- In production, `UPLOADS_DIR` can be redirected to `/tmp/ai-finance-uploads`
- Pandas reads the file after upload to confirm the file is usable
- Excel files are handled through OpenPyXL

## Allowed File Types

- `.csv`
- `.xlsx`

## What To Build Next Later

After this foundation is working, the next step could be:

- preview uploaded data
- validate required columns
- show row and column counts
- start analysis features
