#!/bin/bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!

sleep 2

npm run dev &
NODE_PID=$!

trap "kill $PYTHON_PID $NODE_PID 2>/dev/null; exit" SIGINT SIGTERM EXIT

wait
