#!/bin/bash

# Database initialization script
# Run this after deploying your PostgreSQL database

set -e

# Default values
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-agents_db}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

echo "🔧 Initializing database at ${DB_HOST}:${DB_PORT}/${DB_NAME}..."

# Set password for psql
export PGPASSWORD="${DB_PASSWORD}"

# Check if database is accessible
echo "📡 Testing connection..."
if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c '\q' 2>/dev/null; then
    echo "❌ Error: Cannot connect to database at ${DB_HOST}:${DB_PORT}"
    echo "   Please ensure:"
    echo "   - PostgreSQL is running"
    echo "   - Database credentials are correct"
    echo "   - Network allows connection"
    exit 1
fi

echo "✅ Connected successfully!"

# Run initialization SQL
echo "🚀 Running database initialization script..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f docker/init-db.sql

echo "✨ Database initialized successfully!"
echo ""
echo "📝 Created:"
echo "   - pgvector extension"
echo "   - documents table with vector embeddings"
echo "   - Indexes for similarity search"
