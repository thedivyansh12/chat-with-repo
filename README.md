---
title: Chat With Repo
emoji: 💬
colorFrom: gray
colorTo: black
sdk: docker
app_port: 8080
---

# Chat With Any GitHub Repo (prototype)

**Zero-cost setup:** embeddings run locally inside the app (all-MiniLM-L6-v2, no API). Chat uses the free Gemini API tier.
Get a free key (no card) at https://aistudio.google.com/apikey and put it in `.env` as `LLM_API_KEY`.
Changed database dimensions? Run `docker compose down -v` once to reset the vector table.

Java 17 · Spring Boot 3 · Spring AI · JGit · JavaParser · PostgreSQL + pgvector · D3.js · Docker

## Run locally
    cp .env.example .env        # put your real LLM_API_KEY in it
    docker compose --env-file .env up --build
Open http://localhost:8080, paste a small public Java repo URL, click Index, then ask questions.

Run from IntelliJ instead: `docker compose up db`, set env var LLM_API_KEY, run `App`.

## Deploy online (Render + Neon, both have free tiers)
1. Neon (neon.tech): create a project, run `CREATE EXTENSION IF NOT EXISTS vector;` in its SQL editor.
   Build the JDBC URL as `jdbc:postgresql://<host>/<db>?sslmode=require` and note user + password.
2. Push this folder to a GitHub repo.
3. Render: New > Web Service > connect repo > Runtime: Docker.
4. Environment variables: DB_URL, DB_USER, DB_PASSWORD, LLM_API_KEY
   (optional: LLM_BASE_URL, CHAT_MODEL).
5. Deploy. Render gives you a public https URL. Free instances sleep when idle and are RAM-limited: index small repos.

## API
POST /api/index {url} · GET /api/graph/{id} · POST /api/chat {repoId, question} · GET /api/impact/{id}?method=Class.method
