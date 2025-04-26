#!/bin/bash

# Exit on error
set -e

echo "Starting build process..."

# Install dependencies and build
echo "Installing dependencies and building..."
npm install
npm run build

# Create dist directory if it doesn't exist
echo "Creating dist directory..."
mkdir -p dist

# Install Python dependencies
echo "Installing Python dependencies..."
if [ ! -f "requirements.txt" ]; then
    echo "Error: requirements.txt not found"
    exit 1
fi
pip install -r requirements.txt

echo "Build completed successfully!" 