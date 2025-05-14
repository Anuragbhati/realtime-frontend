# Real-Time Connectivity System with Offline Support

This project implements a real-time connectivity system with offline support using React, Redux Toolkit, and Node.js.

## Features

- WebSocket server with heartbeat mechanism
- Connection status detection (online/offline)
- Offline indicator that persists across page refreshes
- Automatic WebSocket reconnection
- Service Worker for offline support

## Project Structure

```
├── backend/           # Node.js WebSocket server
└── frontend/          # React application
    ├── public/        # Static files
    └── src/           # Source code
        ├── components/  # React components
        ├── redux/       # Redux store and slices
        └── services/    # WebSocket service
```

## Setup Instructions

1. Install dependencies for both backend and frontend:

   ```
   cd backend && npm install
   cd frontend && npm install
   ```

2. Start the backend server:

   ```
   cd backend && npm start
   ```

3. Start the frontend development server:
   ```
   cd frontend && npm start
   ```

## Technologies Used

- **Backend**: Node.js, WebSocket (native implementation)
- **Frontend**: React, Redux Toolkit, Service Workers
