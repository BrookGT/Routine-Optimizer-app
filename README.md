# Routine Optimizer app

A production-ready monorepo built with a clean-architecture backend, a Python AI microservice, a React Native mobile app, and a Next.js admin dashboard.

---

## Project Structure

```
routine-optimizer-app/
├── backend/          Node.js + Express API (ES Modules, Firebase)
├── ai-service/       Python FastAPI microservice
├── mobile/           React Native (Expo) — Sprint 2
├── admin-dashboard/  Next.js admin panel   — Sprint 2
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## Quick Start (Docker)

```bash
# Copy and fill in environment variables
cp backend/.env.example backend/.env

# Build and run all services
docker-compose up --build
```

| Service     | URL                   |
| ----------- | --------------------- |
| Backend API | http://localhost:5000 |
| AI Service  | http://localhost:8000 |

---

## Health Checks

```bash
curl http://localhost:5000/api/health
curl http://localhost:8000/api/health
```

---

## Local Development (without Docker)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in Firebase credentials
npm run dev
```

### AI Service

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Environment Variables

See `backend/.env.example` for all required variables.

---

## Sprint Plan

| Sprint | Focus                       |
| ------ | --------------------------- |
| 1      | Infrastructure & foundation |
| 2      | Auth, user management       |
| 3      | Core business features      |
| 4      | AI integration              |
| 5      | Mobile & admin dashboard    |
