# Docker Setup Guide

This project uses Docker to run PostgreSQL (with pgvector) and Redis locally. This makes development easier and removes the need for external services.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

## Quick Start

### 1. Start Services

```bash
docker-compose up -d
```

This will start:

- **PostgreSQL 16** with pgvector extension on port `5432`
- **Redis 7** on port `6379`

### 2. Verify Services are Running

```bash
# Check container status
docker-compose ps

# Should show both containers as "Up"
```

### 3. Check Logs

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs postgres
docker-compose logs redis

# Follow logs in real-time
docker-compose logs -f
```

## Services Details

### PostgreSQL with pgvector

- **Image**: `pgvector/pgvector:pg16`
- **Port**: `5432`
- **Database**: `agents_db`
- **User**: `postgres`
- **Password**: `postgres`
- **Connection String**: `postgresql://postgres:postgres@localhost:5432/agents_db`

The database is automatically initialized with:

- `vector` extension enabled
- `documents` table for RAG
- Vector similarity indexes
- Metadata indexes

### Redis

- **Image**: `redis:7-alpine`
- **Port**: `6379`
- **Persistence**: AOF (Append-Only File) enabled
- **Connection**: `redis://localhost:6379`

## Common Commands

### Start Services

```bash
# Start in background
docker-compose up -d

# Start with logs visible
docker-compose up
```

### Stop Services

```bash
# Stop containers but keep data
docker-compose stop

# Stop and remove containers (data is preserved in volumes)
docker-compose down
```

### Restart Services

```bash
docker-compose restart
```

### View Logs

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs postgres
docker-compose logs redis

# Follow logs
docker-compose logs -f postgres
```

### Access Services

```bash
# Access PostgreSQL CLI
docker-compose exec postgres psql -U postgres -d agents_db

# Access Redis CLI
docker-compose exec redis redis-cli
```

## Database Management

### Connect to PostgreSQL

```bash
# Using docker exec
docker-compose exec postgres psql -U postgres -d agents_db

# Using local psql client (if installed)
psql postgresql://postgres:postgres@localhost:5432/agents_db
```

### Useful PostgreSQL Commands

```sql
-- List all tables
\dt

-- View documents table structure
\d documents

-- Count documents
SELECT COUNT(*) FROM documents;

-- View recent documents
SELECT id, LEFT(content, 50) as content, created_at
FROM documents
ORDER BY created_at DESC
LIMIT 10;

-- Clear all documents
TRUNCATE TABLE documents RESTART IDENTITY;

-- Exit psql
\q
```

### Connect to Redis

```bash
# Using docker exec
docker-compose exec redis redis-cli

# Using local redis-cli (if installed)
redis-cli
```

### Useful Redis Commands

```bash
# List all keys
KEYS *

# Get all chat history keys
KEYS chat_history:*

# View a specific chat history
LRANGE chat_history:discord:123456789 0 -1

# Clear all data
FLUSHALL

# Exit redis-cli
exit
```

## Data Persistence

Data is persisted in Docker volumes:

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect agentforge_postgres_data
docker volume inspect agentforge_redis_data
```

### Backup Data

```bash
# Backup PostgreSQL
docker-compose exec -T postgres pg_dump -U postgres agents_db > backup.sql

# Backup Redis
docker-compose exec -T redis redis-cli SAVE
docker cp agents-redis:/data/dump.rdb redis-backup.rdb
```

### Restore Data

```bash
# Restore PostgreSQL
cat backup.sql | docker-compose exec -T postgres psql -U postgres agents_db

# Restore Redis
docker cp redis-backup.rdb agents-redis:/data/dump.rdb
docker-compose restart redis
```

### Reset Everything

```bash
# Stop containers and remove volumes (DELETES ALL DATA!)
docker-compose down -v

# Start fresh
docker-compose up -d
```

## Troubleshooting

### Port Already in Use

If you get a "port already in use" error:

```bash
# Check what's using the port
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Kill the process or change ports in docker-compose.yml
```

### Container Won't Start

```bash
# View logs
docker-compose logs postgres
docker-compose logs redis

# Remove and recreate
docker-compose down
docker-compose up -d
```

### Database Connection Issues

```bash
# Verify PostgreSQL is ready
docker-compose exec postgres pg_isready -U postgres

# Check if database exists
docker-compose exec postgres psql -U postgres -c "\l"
```

### Redis Connection Issues

```bash
# Test Redis connection
docker-compose exec redis redis-cli ping
# Should return "PONG"
```

## Production Considerations

For production, you should:

1. **Change default passwords**

   ```yaml
   environment:
     POSTGRES_PASSWORD: your_secure_password
   ```

2. **Use environment variables**

   ```yaml
   environment:
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
   ```

3. **Configure backups**

   - Set up automated backups
   - Test restore procedures

4. **Use external volumes**

   ```yaml
   volumes:
     - /your/backup/path:/var/lib/postgresql/data
   ```

5. **Resource limits**

   ```yaml
   deploy:
     resources:
       limits:
         cpus: "2"
         memory: 4G
   ```

6. **Consider managed services**
   - AWS RDS, Google Cloud SQL, or Azure Database for PostgreSQL
   - AWS ElastiCache, Google Memorystore, or Azure Cache for Redis

## Next Steps

1. Start the services: `docker-compose up -d`
2. Verify they're running: `docker-compose ps`
3. Run your first agent: `bun run examples/rag-agent.ts`
4. Check the data: Connect to PostgreSQL and view the documents table

For environment variable setup, see [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md)
