# Appwrite Cloud Function — `functions/campusvoice-api`

## Purpose
Single serverless API router deployed to Appwrite Cloud Functions executing all authoritative business operations.

## Architecture
- Request dispatcher routing HTTP triggers to handlers.
- Server-side JWT/session validation.
- Employs `node-appwrite` with server API key.
- Strict database isolation with zero client-side direct access.
