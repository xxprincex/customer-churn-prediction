#!/bin/bash

# Build React app
cd client
npm install
npm run build
cd ..

# Create dist directory if it doesn't exist
mkdir -p server/dist

# Copy build files to Flask's dist directory
cp -r client/build/* server/dist/

# Install Python dependencies
cd server
pip install -r requirements.txt
cd .. 