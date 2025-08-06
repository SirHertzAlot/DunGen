# MMORPG Backend System

## Overview

This is a comprehensive MMORPG backend system built with Node.js/Express, TypeScript, and React. The architecture follows a microservices approach with event-driven design principles, implementing ETL pipelines, real-time messaging, and horizontal scaling capabilities. The system is designed to handle high-throughput gaming operations with proper monitoring, authentication, and data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### 2025-08-06 - D&D-Based MMORPG with Unity ECS Implementation
- ✓ Implemented comprehensive interface-based infrastructure system
- ✓ Created metadata-driven JSON configuration for all infrastructure types
- ✓ Added hot-swappable infrastructure components via API calls
- ✓ Enhanced granular grid system: WorldID->RegionID->BlockID->CellID->position
- ✓ All components now have UUIDs for debugging purposes
- ✓ Regional sharding with one Unification container per region
- ✓ Infrastructure management API endpoints for dynamic reconfiguration
- ✓ **Complete D&D game mechanics** - Character classes, races, abilities, spells, combat
- ✓ **Unity ECS Architecture** - Entity Component System with Transform, Health, Stats, Combat, Movement, AI components
- ✓ **Super Fast Live Action Combat** - 60fps updates, real-time attack resolution, initiative system
- ✓ **Unity Communication Bridge** - WebSocket integration for seamless client-server sync
- ✓ **ECS API Endpoints** - Create characters/NPCs, initiate attacks, cast spells, movement commands
- ✓ **Procedural Generation Pipeline** - YAML-configured multi-step terrain generation with built-in noise algorithms
- ✓ **Chunk-Based World System** - 64x64 terrain chunks with heightmaps, biomes, and feature placement
- ✓ **Dashboard Integration** - World generation testing interface with real-time chunk preview

## System Architecture

### Backend Architecture
- **API Layer**: Express.js REST API with comprehensive middleware for authentication, rate limiting, and validation
- **ETL Pipeline**: Event-driven data processing with Redis pub/sub for real-time messaging
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations and migrations
- **Caching**: Redis for session management, pub/sub messaging, and multi-layer caching
- **Queue System**: BullMQ for background job processing and event queuing

### Frontend Architecture
- **Framework**: React with TypeScript and Vite for development
- **UI Library**: Shadcn/ui components with Tailwind CSS for styling
- **State Management**: TanStack Query for server state and caching
- **Routing**: Wouter for client-side routing

### Deployment Strategy
- **Development**: Vite dev server with HMR, Express backend with tsx
- **Production**: Static build with Node.js server, esbuild bundling
- **Database**: PostgreSQL with connection pooling via Neon serverless

## Key Components

### Authentication & Authorization
- JWT-based authentication with session management
- Role-based access control (RBAC) for different user types
- Rate limiting per endpoint with Redis backing
- Audit logging for security compliance

### Infrastructure Architecture
- **Interface-Based Components**: All infrastructure types implement shared interfaces eliminating code duplication
- **Metadata-Driven Configuration**: JSON files define all infrastructure configurations with hot-swappable configs
- **Dynamic Reconfiguration**: API endpoints allow real-time infrastructure node reconfiguration
- **UUID-Based Debugging**: Every architecture piece and game object has UUID for comprehensive tracing
- **Regional Sharding**: Each region has dedicated Unification container for isolated processing

### Game Systems
- **Unity ECS Architecture**: Entity Component System for super fast live action gameplay
- **D&D Combat System**: Turn-based initiative with real-time action resolution
- **Character Management**: Full D&D character creation - classes, races, abilities, spells
- **Live Action Combat**: 60fps updates, attack rolls, damage calculation, spell casting
- **AI Combat System**: Intelligent NPC behavior with tactical decision making
- **Unity Integration**: WebSocket bridge for seamless client-server synchronization
- **Regional Sharding**: Each region has dedicated Unification container for isolated processing

### Monitoring & Observability
- **Prometheus Metrics**: Custom game metrics and system health indicators
- **Grafana Dashboards**: Performance monitoring and alerting
- **Structured Logging**: Winston-based logging with contextual information
- **Health Checks**: Comprehensive system health monitoring

## Data Flow

1. **Client Request**: Frontend sends authenticated requests to Express API
2. **Validation**: Request validation using Zod schemas and middleware
3. **Rate Limiting**: Redis-based rate limiting per user/IP
4. **Business Logic**: Controller processes request and interacts with repositories
5. **Database Operations**: Drizzle ORM handles type-safe database queries
6. **Event Emission**: Critical events published to Redis pub/sub system
7. **Queue Processing**: Background workers process events asynchronously
8. **Real-time Updates**: WebSocket connections for live game updates
9. **Response**: JSON response with appropriate status codes and error handling

## External Dependencies

### Core Dependencies
- **Database**: Neon PostgreSQL serverless with Drizzle ORM
- **Cache/Pub-Sub**: Redis (ioredis client) for caching and messaging
- **Queue System**: BullMQ for job processing
- **Authentication**: bcrypt for password hashing, JWT for tokens

### Monitoring Stack
- **Metrics**: Prometheus with custom exporters
- **Visualization**: Grafana dashboards for monitoring
- **Logging**: Winston for structured logging
- **Health Checks**: Custom health monitoring system

### UI Dependencies
- **Component Library**: Radix UI primitives with Shadcn/ui
- **Styling**: Tailwind CSS with CSS variables for theming
- **Forms**: React Hook Form with Zod validation
- **Data Fetching**: TanStack Query for server state management

## Deployment Strategy

### Development Environment
- Vite development server for frontend with HMR
- tsx for running TypeScript backend with hot reload
- Local PostgreSQL or Neon database connection
- Redis for caching and pub/sub (local or cloud)

### Production Environment
- Static frontend build served by Express
- Node.js backend with esbuild bundling
- PostgreSQL database with connection pooling
- Redis cluster for high availability
- Prometheus/Grafana for monitoring
- Docker containerization support

### Database Management
- Drizzle migrations for schema changes
- Database seeding for development data
- Backup and recovery procedures
- Horizontal sharding for player data across regions

The system is designed for horizontal scalability with stateless services, event-driven architecture, and proper separation of concerns between game logic, data persistence, and real-time communication.