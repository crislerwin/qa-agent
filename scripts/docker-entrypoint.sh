#!/bin/bash

set -e

echo "🚀 Starting AgentForge API..."

# Check if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
    echo "📊 Database URL detected: Initializing database..."

    # Extract database connection details from DATABASE_URL
    # Format: postgresql://user:password@host:port/database
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

    export PGPASSWORD="$DB_PASSWORD"

    # Wait for database to be ready
    echo "⏳ Waiting for database at $DB_HOST:$DB_PORT..."
    for i in {1..30}; do
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; then
            echo "✅ Database is ready!"
            break
        fi
        echo "   Attempt $i/30: Database not ready yet..."
        sleep 2
    done

    # Run pgvector extension setup
    if [ -f "/usr/src/app/docker/init-db.sql" ]; then
        echo "🔌 Ensuring pgvector extension is enabled..."
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /usr/src/app/docker/init-db.sql 2>&1 | grep -v "already exists"; then
            echo "✅ pgvector extension ready!"
        else
            echo "✅ pgvector extension already enabled"
        fi
    fi

    # Run Drizzle migrations
    if [ -f "/usr/src/app/scripts/run-migrations.ts" ]; then
        echo "🗄️  Running Drizzle ORM migrations..."
        if bun run /usr/src/app/scripts/run-migrations.ts; then
            echo "✅ Database migrations completed!"
        else
            echo "❌ Migration failed! Check logs above."
            exit 1
        fi
    else
        echo "⚠️  No migration script found, skipping migrations"
    fi
else
    echo "ℹ️  No DATABASE_URL set, skipping database initialization"
fi

echo ""
echo "🎯 Starting API server on port ${API_PORT:-8000}..."
echo ""

# Start the application
exec bun run server.js
