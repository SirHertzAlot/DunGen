using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using System;
using System.Collections.Generic;

namespace MMORPG.Unification.Regions
{
    /// <summary>
    /// Grid-based spatial mapping system for efficient region and entity management
    /// Handles spatial queries, region boundaries, and entity distribution
    /// </summary>
    public class GridMapper
    {
        private readonly Dictionary<int2, GridCell> _grid;
        private readonly Dictionary<Entity, int2> _entityToGrid;
        private readonly float _cellSize;
        private readonly int _maxCellsPerRegion;
        private readonly object _lock = new object();

        public GridMapper(float cellSize = 100f, int maxCellsPerRegion = 16)
        {
            _grid = new Dictionary<int2, GridCell>();
            _entityToGrid = new Dictionary<Entity, int2>();
            _cellSize = cellSize;
            _maxCellsPerRegion = maxCellsPerRegion;
        }

        /// <summary>
        /// Convert world position to grid coordinates
        /// </summary>
        public int2 WorldToGrid(float3 worldPosition)
        {
            return new int2(
                (int)math.floor(worldPosition.x / _cellSize),
                (int)math.floor(worldPosition.z / _cellSize)
            );
        }

        /// <summary>
        /// Convert grid coordinates to world position (center of cell)
        /// </summary>
        public float3 GridToWorld(int2 gridCoord)
        {
            return new float3(
                gridCoord.x * _cellSize + _cellSize * 0.5f,
                0,
                gridCoord.y * _cellSize + _cellSize * 0.5f
            );
        }

        /// <summary>
        /// Get region ID from grid coordinates
        /// </summary>
        public string GetRegionId(int2 gridCoord)
        {
            // Group grid cells into regions (4x4 cells per region by default)
            int regionX = gridCoord.x / 4;
            int regionY = gridCoord.y / 4;
            return $"region_{regionX}_{regionY}";
        }

        /// <summary>
        /// Add entity to grid at specified position
        /// </summary>
        public bool AddEntity(Entity entity, float3 position, EntityType entityType)
        {
            lock (_lock)
            {
                var gridCoord = WorldToGrid(position);
                
                // Remove from previous grid cell if exists
                if (_entityToGrid.TryGetValue(entity, out var prevGrid))
                {
                    RemoveEntityFromCell(entity, prevGrid);
                }

                // Add to new grid cell
                if (!_grid.TryGetValue(gridCoord, out var cell))
                {
                    cell = new GridCell
                    {
                        Coordinate = gridCoord,
                        RegionId = GetRegionId(gridCoord),
                        Entities = new Dictionary<EntityType, HashSet<Entity>>()
                    };
                    _grid[gridCoord] = cell;
                }

                // Initialize entity type set if needed
                if (!cell.Entities.TryGetValue(entityType, out var entitySet))
                {
                    entitySet = new HashSet<Entity>();
                    cell.Entities[entityType] = entitySet;
                }

                entitySet.Add(entity);
                _entityToGrid[entity] = gridCoord;
                cell.LastUpdate = DateTime.UtcNow;

                return true;
            }
        }

        /// <summary>
        /// Remove entity from grid
        /// </summary>
        public bool RemoveEntity(Entity entity)
        {
            lock (_lock)
            {
                if (_entityToGrid.TryGetValue(entity, out var gridCoord))
                {
                    RemoveEntityFromCell(entity, gridCoord);
                    _entityToGrid.Remove(entity);
                    return true;
                }
                return false;
            }
        }

        /// <summary>
        /// Move entity to new position
        /// </summary>
        public bool MoveEntity(Entity entity, float3 newPosition)
        {
            lock (_lock)
            {
                var newGridCoord = WorldToGrid(newPosition);
                
                if (_entityToGrid.TryGetValue(entity, out var currentGrid))
                {
                    // Check if entity is moving to a different grid cell
                    if (!currentGrid.Equals(newGridCoord))
                    {
                        // Find entity type
                        var entityType = GetEntityTypeFromCell(entity, currentGrid);
                        if (entityType.HasValue)
                        {
                            RemoveEntityFromCell(entity, currentGrid);
                            return AddEntity(entity, newPosition, entityType.Value);
                        }
                    }
                    return true; // Same cell, no movement needed
                }
                
                // Entity not found, assume it's a player for now
                return AddEntity(entity, newPosition, EntityType.Player);
            }
        }

        /// <summary>
        /// Get all entities within radius of a position
        /// </summary>
        public List<Entity> GetEntitiesInRadius(float3 center, float radius, EntityType? filterType = null)
        {
            var result = new List<Entity>();
            var centerGrid = WorldToGrid(center);
            var gridRadius = (int)math.ceil(radius / _cellSize);

            lock (_lock)
            {
                for (int x = centerGrid.x - gridRadius; x <= centerGrid.x + gridRadius; x++)
                {
                    for (int y = centerGrid.y - gridRadius; y <= centerGrid.y + gridRadius; y++)
                    {
                        var gridCoord = new int2(x, y);
                        if (_grid.TryGetValue(gridCoord, out var cell))
                        {
                            foreach (var kvp in cell.Entities)
                            {
                                if (filterType == null || kvp.Key == filterType.Value)
                                {
                                    result.AddRange(kvp.Value);
                                }
                            }
                        }
                    }
                }
            }

            return result;
        }

        /// <summary>
        /// Get all entities in a specific region
        /// </summary>
        public List<Entity> GetEntitiesInRegion(string regionId, EntityType? filterType = null)
        {
            var result = new List<Entity>();

            lock (_lock)
            {
                foreach (var kvp in _grid)
                {
                    if (kvp.Value.RegionId == regionId)
                    {
                        foreach (var entityKvp in kvp.Value.Entities)
                        {
                            if (filterType == null || entityKvp.Key == filterType.Value)
                            {
                                result.AddRange(entityKvp.Value);
                            }
                        }
                    }
                }
            }

            return result;
        }

        /// <summary>
        /// Get entities in rectangular area
        /// </summary>
        public List<Entity> GetEntitiesInArea(float3 minBounds, float3 maxBounds, EntityType? filterType = null)
        {
            var result = new List<Entity>();
            var minGrid = WorldToGrid(minBounds);
            var maxGrid = WorldToGrid(maxBounds);

            lock (_lock)
            {
                for (int x = minGrid.x; x <= maxGrid.x; x++)
                {
                    for (int y = minGrid.y; y <= maxGrid.y; y++)
                    {
                        var gridCoord = new int2(x, y);
                        if (_grid.TryGetValue(gridCoord, out var cell))
                        {
                            foreach (var kvp in cell.Entities)
                            {
                                if (filterType == null || kvp.Key == filterType.Value)
                                {
                                    result.AddRange(kvp.Value);
                                }
                            }
                        }
                    }
                }
            }

            return result;
        }

        /// <summary>
        /// Get adjacent grid cells
        /// </summary>
        public List<int2> GetAdjacentCells(int2 gridCoord, int radius = 1)
        {
            var adjacent = new List<int2>();
            
            for (int x = gridCoord.x - radius; x <= gridCoord.x + radius; x++)
            {
                for (int y = gridCoord.y - radius; y <= gridCoord.y + radius; y++)
                {
                    if (x == gridCoord.x && y == gridCoord.y) continue; // Skip center
                    adjacent.Add(new int2(x, y));
                }
            }

            return adjacent;
        }

        /// <summary>
        /// Get grid cells that belong to a region
        /// </summary>
        public List<int2> GetRegionCells(string regionId)
        {
            var cells = new List<int2>();

            lock (_lock)
            {
                foreach (var kvp in _grid)
                {
                    if (kvp.Value.RegionId == regionId)
                    {
                        cells.Add(kvp.Key);
                    }
                }
            }

            return cells;
        }

        /// <summary>
        /// Get grid statistics for monitoring
        /// </summary>
        public GridStatistics GetGridStatistics()
        {
            lock (_lock)
            {
                var stats = new GridStatistics
                {
                    TotalCells = _grid.Count,
                    TotalEntities = _entityToGrid.Count,
                    EntitiesByType = new Dictionary<EntityType, int>(),
                    RegionCounts = new Dictionary<string, int>(),
                    CellUtilization = new Dictionary<int2, int>()
                };

                foreach (var kvp in _grid)
                {
                    var cell = kvp.Value;
                    var cellEntityCount = 0;

                    foreach (var entityKvp in cell.Entities)
                    {
                        var entityType = entityKvp.Key;
                        var entityCount = entityKvp.Value.Count;
                        
                        cellEntityCount += entityCount;
                        
                        if (!stats.EntitiesByType.TryGetValue(entityType, out var typeCount))
                        {
                            typeCount = 0;
                        }
                        stats.EntitiesByType[entityType] = typeCount + entityCount;
                    }

                    stats.CellUtilization[kvp.Key] = cellEntityCount;

                    if (!stats.RegionCounts.TryGetValue(cell.RegionId, out var regionCount))
                    {
                        regionCount = 0;
                    }
                    stats.RegionCounts[cell.RegionId] = regionCount + cellEntityCount;
                }

                return stats;
            }
        }

        /// <summary>
        /// Optimize grid by removing empty cells
        /// </summary>
        public void OptimizeGrid()
        {
            lock (_lock)
            {
                var emptyCells = new List<int2>();

                foreach (var kvp in _grid)
                {
                    var cell = kvp.Value;
                    var isEmpty = true;

                    foreach (var entityKvp in cell.Entities)
                    {
                        if (entityKvp.Value.Count > 0)
                        {
                            isEmpty = false;
                            break;
                        }
                    }

                    if (isEmpty)
                    {
                        emptyCells.Add(kvp.Key);
                    }
                }

                foreach (var cellCoord in emptyCells)
                {
                    _grid.Remove(cellCoord);
                }
            }
        }

        /// <summary>
        /// Check if position is near region boundary
        /// </summary>
        public bool IsNearRegionBoundary(float3 position, float threshold = 50f)
        {
            var gridCoord = WorldToGrid(position);
            var worldPos = GridToWorld(gridCoord);
            
            // Check distance to grid cell edges
            var distToEdgeX = math.min(
                math.abs(position.x - (worldPos.x - _cellSize * 0.5f)),
                math.abs(position.x - (worldPos.x + _cellSize * 0.5f))
            );
            
            var distToEdgeZ = math.min(
                math.abs(position.z - (worldPos.z - _cellSize * 0.5f)),
                math.abs(position.z - (worldPos.z + _cellSize * 0.5f))
            );

            return math.min(distToEdgeX, distToEdgeZ) < threshold;
        }

        // Helper methods
        private void RemoveEntityFromCell(Entity entity, int2 gridCoord)
        {
            if (_grid.TryGetValue(gridCoord, out var cell))
            {
                foreach (var entityKvp in cell.Entities)
                {
                    if (entityKvp.Value.Remove(entity))
                    {
                        break;
                    }
                }
                cell.LastUpdate = DateTime.UtcNow;
            }
        }

        private EntityType? GetEntityTypeFromCell(Entity entity, int2 gridCoord)
        {
            if (_grid.TryGetValue(gridCoord, out var cell))
            {
                foreach (var entityKvp in cell.Entities)
                {
                    if (entityKvp.Value.Contains(entity))
                    {
                        return entityKvp.Key;
                    }
                }
            }
            return null;
        }
    }

    // Data structures
    public class GridCell
    {
        public int2 Coordinate { get; set; }
        public string RegionId { get; set; }
        public Dictionary<EntityType, HashSet<Entity>> Entities { get; set; }
        public DateTime LastUpdate { get; set; }
        public Dictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>();
    }

    public class GridStatistics
    {
        public int TotalCells { get; set; }
        public int TotalEntities { get; set; }
        public Dictionary<EntityType, int> EntitiesByType { get; set; }
        public Dictionary<string, int> RegionCounts { get; set; }
        public Dictionary<int2, int> CellUtilization { get; set; }
    }

    public enum EntityType
    {
        Player,
        NPC,
        Monster,
        Resource,
        Item,
        Structure,
        Projectile,
        Effect
    }
}
