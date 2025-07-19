using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using System;
using System.Collections.Generic;

namespace MMORPG.Unification.Regions
{
    // Region management system for handling player distribution and load balancing
    public class RegionManager
    {
        private readonly Dictionary<string, RegionData> _regions;
        private readonly Dictionary<Entity, string> _playerRegions;
        private readonly object _lock = new object();

        public RegionManager()
        {
            _regions = new Dictionary<string, RegionData>();
            _playerRegions = new Dictionary<Entity, string>();
            InitializeDefaultRegions();
        }

        private void InitializeDefaultRegions()
        {
            // Create default world regions
            var defaultRegions = new[]
            {
                new RegionData
                {
                    Id = "region_0_0",
                    Name = "Central Plains",
                    Bounds = new RegionBounds { MinX = -500, MaxX = 500, MinY = -500, MaxY = 500 },
                    MaxPlayers = 100,
                    ServerNode = "server_01",
                    Status = RegionStatus.Active,
                    Biome = "plains",
                    Difficulty = "normal"
                },
                new RegionData
                {
                    Id = "region_1_0",
                    Name = "Eastern Forest",
                    Bounds = new RegionBounds { MinX = 500, MaxX = 1500, MinY = -500, MaxY = 500 },
                    MaxPlayers = 80,
                    ServerNode = "server_01",
                    Status = RegionStatus.Active,
                    Biome = "forest",
                    Difficulty = "easy"
                },
                new RegionData
                {
                    Id = "region_0_1",
                    Name = "Northern Mountains",
                    Bounds = new RegionBounds { MinX = -500, MaxX = 500, MinY = 500, MaxY = 1500 },
                    MaxPlayers = 60,
                    ServerNode = "server_02",
                    Status = RegionStatus.Active,
                    Biome = "mountain",
                    Difficulty = "hard"
                },
                new RegionData
                {
                    Id = "region_-1_0",
                    Name = "Western Desert",
                    Bounds = new RegionBounds { MinX = -1500, MaxX = -500, MinY = -500, MaxY = 500 },
                    MaxPlayers = 70,
                    ServerNode = "server_02",
                    Status = RegionStatus.Active,
                    Biome = "desert",
                    Difficulty = "normal"
                },
                new RegionData
                {
                    Id = "region_0_-1",
                    Name = "Southern Swamps",
                    Bounds = new RegionBounds { MinX = -500, MaxX = 500, MinY = -1500, MaxY = -500 },
                    MaxPlayers = 50,
                    ServerNode = "server_03",
                    Status = RegionStatus.Active,
                    Biome = "swamp",
                    Difficulty = "extreme"
                }
            };

            foreach (var region in defaultRegions)
            {
                _regions[region.Id] = region;
            }
        }

        public string GetRegionIdFromPosition(float3 position)
        {
            lock (_lock)
            {
                foreach (var kvp in _regions)
                {
                    var region = kvp.Value;
                    if (IsPositionInRegion(position, region.Bounds))
                    {
                        return kvp.Key;
                    }
                }

                // If no specific region found, assign to closest region
                return GetClosestRegion(position);
            }
        }

        public bool TryMovePlayerToRegion(Entity player, string regionId, float3 position)
        {
            lock (_lock)
            {
                if (!_regions.TryGetValue(regionId, out var region))
                {
                    return false;
                }

                // Check if region is available
                if (region.Status != RegionStatus.Active)
                {
                    return false;
                }

                // Check capacity
                if (region.CurrentPlayers >= region.MaxPlayers)
                {
                    // Try to find alternative region
                    var alternativeRegion = FindAlternativeRegion(position);
                    if (alternativeRegion != null)
                    {
                        regionId = alternativeRegion.Id;
                        region = alternativeRegion;
                    }
                    else
                    {
                        return false; // No space available
                    }
                }

                // Remove from previous region
                if (_playerRegions.TryGetValue(player, out var previousRegion))
                {
                    if (_regions.TryGetValue(previousRegion, out var prevRegionData))
                    {
                        prevRegionData.CurrentPlayers--;
                        prevRegionData.Players.Remove(player);
                    }
                }

                // Add to new region
                region.CurrentPlayers++;
                region.Players.Add(player);
                _playerRegions[player] = regionId;

                return true;
            }
        }

        public void RemovePlayer(Entity player)
        {
            lock (_lock)
            {
                if (_playerRegions.TryGetValue(player, out var regionId))
                {
                    if (_regions.TryGetValue(regionId, out var region))
                    {
                        region.CurrentPlayers = Math.Max(0, region.CurrentPlayers - 1);
                        region.Players.Remove(player);
                    }
                    _playerRegions.Remove(player);
                }
            }
        }

        public RegionData GetRegionData(string regionId)
        {
            lock (_lock)
            {
                return _regions.TryGetValue(regionId, out var region) ? region : null;
            }
        }

        public List<RegionData> GetAllRegions()
        {
            lock (_lock)
            {
                return new List<RegionData>(_regions.Values);
            }
        }

        public List<Entity> GetPlayersInRegion(string regionId)
        {
            lock (_lock)
            {
                if (_regions.TryGetValue(regionId, out var region))
                {
                    return new List<Entity>(region.Players);
                }
                return new List<Entity>();
            }
        }

        public List<Entity> GetPlayersInRadius(float3 position, float radius)
        {
            var playersInRadius = new List<Entity>();
            var regionId = GetRegionIdFromPosition(position);
            
            lock (_lock)
            {
                // Check current region
                if (_regions.TryGetValue(regionId, out var region))
                {
                    playersInRadius.AddRange(region.Players);
                }

                // Check adjacent regions for edge cases
                var adjacentRegions = GetAdjacentRegions(regionId);
                foreach (var adjRegionId in adjacentRegions)
                {
                    if (_regions.TryGetValue(adjRegionId, out var adjRegion))
                    {
                        playersInRadius.AddRange(adjRegion.Players);
                    }
                }
            }

            return playersInRadius;
        }

        public void UpdateRegionStatus(string regionId, RegionStatus status, string reason = "")
        {
            lock (_lock)
            {
                if (_regions.TryGetValue(regionId, out var region))
                {
                    region.Status = status;
                    region.LastStatusChange = DateTime.UtcNow;
                    
                    // Handle region maintenance
                    if (status == RegionStatus.Maintenance || status == RegionStatus.Offline)
                    {
                        MigratePlayersFromRegion(regionId, reason);
                    }
                }
            }
        }

        public RegionLoadInfo GetRegionLoad(string regionId)
        {
            lock (_lock)
            {
                if (_regions.TryGetValue(regionId, out var region))
                {
                    return new RegionLoadInfo
                    {
                        RegionId = regionId,
                        CurrentPlayers = region.CurrentPlayers,
                        MaxPlayers = region.MaxPlayers,
                        LoadPercentage = (float)region.CurrentPlayers / region.MaxPlayers * 100f,
                        Status = region.Status,
                        ServerNode = region.ServerNode
                    };
                }
                return null;
            }
        }

        public List<RegionLoadInfo> GetServerLoadInfo()
        {
            var loadInfo = new List<RegionLoadInfo>();
            
            lock (_lock)
            {
                foreach (var region in _regions.Values)
                {
                    loadInfo.Add(new RegionLoadInfo
                    {
                        RegionId = region.Id,
                        CurrentPlayers = region.CurrentPlayers,
                        MaxPlayers = region.MaxPlayers,
                        LoadPercentage = (float)region.CurrentPlayers / region.MaxPlayers * 100f,
                        Status = region.Status,
                        ServerNode = region.ServerNode
                    });
                }
            }

            return loadInfo;
        }

        public void BalanceRegionLoad()
        {
            lock (_lock)
            {
                var overloadedRegions = _regions.Values
                    .Where(r => r.CurrentPlayers > r.MaxPlayers * 0.9f && r.Status == RegionStatus.Active)
                    .ToList();

                var underloadedRegions = _regions.Values
                    .Where(r => r.CurrentPlayers < r.MaxPlayers * 0.6f && r.Status == RegionStatus.Active)
                    .ToList();

                foreach (var overloaded in overloadedRegions)
                {
                    var nearby = GetAdjacentRegions(overloaded.Id)
                        .Where(id => _regions.ContainsKey(id))
                        .Select(id => _regions[id])
                        .Where(r => r.CurrentPlayers < r.MaxPlayers * 0.8f)
                        .OrderBy(r => r.CurrentPlayers)
                        .FirstOrDefault();

                    if (nearby != null)
                    {
                        // Suggest player migration (would be handled by game logic)
                        TriggerPlayerMigrationSuggestion(overloaded.Id, nearby.Id);
                    }
                }
            }
        }

        private bool IsPositionInRegion(float3 position, RegionBounds bounds)
        {
            return position.x >= bounds.MinX && position.x <= bounds.MaxX &&
                   position.z >= bounds.MinY && position.z <= bounds.MaxY;
        }

        private string GetClosestRegion(float3 position)
        {
            string closestRegion = "region_0_0"; // Default
            float closestDistance = float.MaxValue;

            foreach (var kvp in _regions)
            {
                var region = kvp.Value;
                var centerX = (region.Bounds.MinX + region.Bounds.MaxX) / 2f;
                var centerY = (region.Bounds.MinY + region.Bounds.MaxY) / 2f;
                var distance = math.distance(position.xz, new float2(centerX, centerY));

                if (distance < closestDistance)
                {
                    closestDistance = distance;
                    closestRegion = kvp.Key;
                }
            }

            return closestRegion;
        }

        private RegionData FindAlternativeRegion(float3 position)
        {
            var currentRegionId = GetRegionIdFromPosition(position);
            var adjacentRegions = GetAdjacentRegions(currentRegionId);

            foreach (var adjRegionId in adjacentRegions)
            {
                if (_regions.TryGetValue(adjRegionId, out var region) &&
                    region.Status == RegionStatus.Active &&
                    region.CurrentPlayers < region.MaxPlayers)
                {
                    return region;
                }
            }

            return null;
        }

        private List<string> GetAdjacentRegions(string regionId)
        {
            var adjacent = new List<string>();
            
            // Parse region coordinates (assuming format "region_x_y")
            var parts = regionId.Split('_');
            if (parts.Length >= 3 && int.TryParse(parts[1], out var x) && int.TryParse(parts[2], out var y))
            {
                // Add all 8 adjacent regions
                for (int dx = -1; dx <= 1; dx++)
                {
                    for (int dy = -1; dy <= 1; dy++)
                    {
                        if (dx == 0 && dy == 0) continue; // Skip self
                        
                        var adjRegionId = $"region_{x + dx}_{y + dy}";
                        adjacent.Add(adjRegionId);
                    }
                }
            }

            return adjacent;
        }

        private void MigratePlayersFromRegion(string regionId, string reason)
        {
            if (!_regions.TryGetValue(regionId, out var region))
                return;

            var playersToMigrate = new List<Entity>(region.Players);
            foreach (var player in playersToMigrate)
            {
                var alternativeRegion = FindAlternativeRegion(new float3(0, 0, 0)); // Would use actual player position
                if (alternativeRegion != null)
                {
                    // Trigger player migration event
                    TriggerPlayerMigration(player, regionId, alternativeRegion.Id, reason);
                }
            }
        }

        private void TriggerPlayerMigrationSuggestion(string fromRegion, string toRegion)
        {
            // This would trigger events for the game systems to handle
            // For now, just log the suggestion
            Console.WriteLine($"Load balancing suggestion: migrate players from {fromRegion} to {toRegion}");
        }

        private void TriggerPlayerMigration(Entity player, string fromRegion, string toRegion, string reason)
        {
            // This would trigger forced migration events
            Console.WriteLine($"Migrating player {player} from {fromRegion} to {toRegion} due to: {reason}");
        }
    }

    // Data structures
    public class RegionData
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public RegionBounds Bounds { get; set; }
        public int MaxPlayers { get; set; }
        public int CurrentPlayers { get; set; }
        public string ServerNode { get; set; }
        public RegionStatus Status { get; set; }
        public string Biome { get; set; }
        public string Difficulty { get; set; }
        public HashSet<Entity> Players { get; set; } = new HashSet<Entity>();
        public DateTime LastStatusChange { get; set; } = DateTime.UtcNow;
        public Dictionary<string, object> Properties { get; set; } = new Dictionary<string, object>();
    }

    public struct RegionBounds
    {
        public float MinX;
        public float MaxX;
        public float MinY;
        public float MaxY;
    }

    public class RegionLoadInfo
    {
        public string RegionId { get; set; }
        public int CurrentPlayers { get; set; }
        public int MaxPlayers { get; set; }
        public float LoadPercentage { get; set; }
        public RegionStatus Status { get; set; }
        public string ServerNode { get; set; }
    }

    public enum RegionStatus
    {
        Active,
        Maintenance,
        Offline,
        Loading
    }
}
