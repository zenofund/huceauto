# Huce Autos Backend API

This is the backend API for the Huce Autos application, built with Node.js, Express, and Prisma (PostgreSQL).

## Prerequisites

1.  **Node.js**: Ensure Node.js is installed.
2.  **PostgreSQL**: You need a running PostgreSQL database instance.

## Setup

1.  **Install Dependencies**:
    ```bash
    cd server
    npm install
    ```

2.  **Environment Variables**:
    Check `.env` and update the `DATABASE_URL` with your PostgreSQL credentials.
    ```env
    DATABASE_URL="postgresql://postgres:password@localhost:5432/huce_autos?schema=public"
    ```

3.  **Database Migration**:
    Once your PostgreSQL server is running and configured in `.env`:
    ```bash
    npx prisma migrate dev --name init
    ```
    This will create the tables in your database based on `prisma/schema.prisma`.

## Running the Server

*   **Development Mode**:
    ```bash
    npm run dev
    ```
    Runs on `http://localhost:5000`.

*   **Build**:
    ```bash
    npm run build
    ```

*   **Production Start**:
    ```bash
    npm start
    ```

## API Endpoints

*   `GET /`: Welcome message.
*   `GET /health`: Health check (checks database connection).
