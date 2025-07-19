using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Transforms;
using Unity.NetCode;
using System;

namespace MMORPG.Unification.ECS
{
    // World region component
    [Serializable]
    public struct WorldRegion : IComponentData
    {
        public FixedString32Bytes RegionId;
        public FixedString64Bytes Name;
        public float4 Bounds; // minX, minY, maxX, maxY
        public int MaxPlayers;
        public int CurrentPlayers;
        public FixedString32Bytes ServerNode;
        public RegionStatus Status;
        public double LastUpdateTime;
    }

    // Weather system component
    [Serializable]
    public struct WeatherData : IComponentData
    {
        public WeatherType Type;
        public float Intensity;
        public float Duration;
        public float RemainingTime;
        public float Visibility;
        public float MovementModifier;
        public float RegenModifier;
    }

    // World events
    [Serializable]
    public struct WorldEvent : IComponentData
    {
        public FixedString64Bytes EventId;
        public FixedString32Bytes EventType;
        public FixedString64Bytes Name;
        public FixedString512Bytes Description;
        public float Duration;
        public float RemainingTime;
        public bool IsGlobal;
        public FixedString32Bytes RegionId;
        public EventPhase Phase;
    }

    // Resource spawns
    [Serializable]
    public struct ResourceNode : IComponentData
    {
        public FixedString32Bytes ResourceType;
        public ResourceQuality Quality;
        public int Quantity;
        public int MaxQuantity;
        public float RespawnTime;
        public float TimeUntilRespawn;
        public bool IsAvailable;
        public FixedString32Bytes RegionId;
    }

    // NPC spawns
    [Serializable]
    public struct NPCSpawn : IComponentData
    {
        public FixedString32Bytes NPCType;
        public int Level;
        public float Health;
        public float MaxHealth;
        public NPCBehavior Behavior;
        public float AggroRange;
        public float RespawnTime;
        public bool IsAlive;
        public FixedString32Bytes RegionId;
    }

    // Territory control
    [Serializable]
    public struct Territory : IComponentData
    {
        public FixedString64Bytes TerritoryId;
        public FixedString64Bytes Name;
        public Entity Owner; // Guild or player entity
        public TerritoryType OwnerType;
        public float4 Bounds;
        public float ControlStrength;
        public double ClaimedTime;
        public bool IsContested;
    }

    // Dynamic objects (doors, bridges, etc.)
    [Serializable]
    public struct WorldObject : IComponentData
    {
        public FixedString32Bytes ObjectType;
        public ObjectState State;
        public float InteractionRange;
        public bool RequiresKey;
        public FixedString32Bytes KeyId;
        public double LastInteraction;
    }

    // Enums
    public enum RegionStatus
    {
        Active,
        Maintenance,
        Offline
    }

    public enum WeatherType
    {
        Clear,
        Rain,
        Storm,
        Snow,
        Fog,
        Sandstorm
    }

    public enum EventPhase
    {
        Preparation,
        Active,
        Ending,
        Completed
    }

    public enum ResourceQuality
    {
        Common,
        Uncommon,
        Rare,
        Epic,
        Legendary
    }

    public enum NPCBehavior
    {
        Passive,
        Aggressive,
        Defensive,
        Patrol,
        Vendor
    }

    public enum TerritoryType
    {
        Player,
        Guild,
        System
    }

    public enum ObjectState
    {
        Closed,
        Open,
        Locked,
        Broken,
        Hidden
    }

    // World System for managing world state
    [UpdateInGroup(typeof(ServerSimulationSystemGroup))]
    public partial class WorldSystem : SystemBase
    {
        private EndSimulationEntityCommandBufferSystem m_EndSimulationEcbSystem;
        private Random m_Random;

        protected override void OnCreate()
        {
            m_EndSimulationEcbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
            m_Random = new Random((uint)System.DateTime.Now.Ticks);
        }

        protected override void OnUpdate()
        {
            var deltaTime = SystemAPI.Time.DeltaTime;
            var networkTime = SystemAPI.GetSingleton<NetworkTime>();
            var currentTime = networkTime.ServerTick.ToFixedtimeSeconds();

            UpdateWeatherSystems(deltaTime, currentTime);
            UpdateWorldEvents(deltaTime, currentTime);
            UpdateResourceNodes(deltaTime, currentTime);
            UpdateNPCSpawns(deltaTime, currentTime);
            UpdateTerritoryControl(deltaTime, currentTime);
            MonitorRegionPopulation(currentTime);
        }

        private void UpdateWeatherSystems(float deltaTime, double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<WeatherData, WorldRegion>()
                .ForEach((Entity entity, int entityInQueryIndex, ref WeatherData weather, 
                         in WorldRegion region) =>
                {
                    weather.RemainingTime -= deltaTime;

                    if (weather.RemainingTime <= 0)
                    {
                        // Change weather
                        var newWeatherType = (WeatherType)m_Random.NextInt(0, 6);
                        var newIntensity = m_Random.NextFloat(0.1f, 1.0f);
                        var newDuration = m_Random.NextFloat(300f, 1800f); // 5-30 minutes

                        weather.Type = newWeatherType;
                        weather.Intensity = newIntensity;
                        weather.Duration = newDuration;
                        weather.RemainingTime = newDuration;

                        // Set weather effects
                        SetWeatherEffects(ref weather);

                        // Trigger weather change event
                        ecb.AddComponent(entityInQueryIndex, entity, new WeatherChangedEvent
                        {
                            RegionId = region.RegionId,
                            NewWeatherType = newWeatherType,
                            Intensity = newIntensity,
                            Timestamp = currentTime
                        });
                    }
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void UpdateWorldEvents(float deltaTime, double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<WorldEvent>()
                .ForEach((Entity entity, int entityInQueryIndex, ref WorldEvent worldEvent) =>
                {
                    worldEvent.RemainingTime -= deltaTime;

                    // Update event phase
                    var progress = 1.0f - (worldEvent.RemainingTime / worldEvent.Duration);

                    if (progress < 0.1f)
                        worldEvent.Phase = EventPhase.Preparation;
                    else if (progress < 0.9f)
                        worldEvent.Phase = EventPhase.Active;
                    else if (progress < 1.0f)
                        worldEvent.Phase = EventPhase.Ending;
                    else
                        worldEvent.Phase = EventPhase.Completed;

                    if (worldEvent.RemainingTime <= 0)
                    {
                        // End the event
                        ecb.AddComponent(entityInQueryIndex, entity, new WorldEventEndedEvent
                        {
                            EventId = worldEvent.EventId,
                            EventType = worldEvent.EventType,
                            RegionId = worldEvent.RegionId,
                            Timestamp = currentTime
                        });

                        ecb.DestroyEntity(entityInQueryIndex, entity);
                    }
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void UpdateResourceNodes(float deltaTime, double currentTime)
        {
            Entities
                .WithAll<ResourceNode>()
                .ForEach((ref ResourceNode resource) =>
                {
                    if (!resource.IsAvailable && resource.TimeUntilRespawn > 0)
                    {
                        resource.TimeUntilRespawn -= deltaTime;

                        if (resource.TimeUntilRespawn <= 0)
                        {
                            // Respawn resource
                            resource.IsAvailable = true;
                            resource.Quantity = resource.MaxQuantity;
                            resource.TimeUntilRespawn = 0;
                        }
                    }
                }).ScheduleParallel();
        }

        private void UpdateNPCSpawns(float deltaTime, double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<NPCSpawn>()
                .ForEach((Entity entity, int entityInQueryIndex, ref NPCSpawn npc) =>
                {
                    if (!npc.IsAlive)
                    {
                        npc.RespawnTime -= deltaTime;

                        if (npc.RespawnTime <= 0)
                        {
                            // Respawn NPC
                            npc.IsAlive = true;
                            npc.Health = npc.MaxHealth;
                            npc.RespawnTime = 0;

                            // Trigger NPC respawn event
                            ecb.AddComponent(entityInQueryIndex, entity, new NPCRespawnedEvent
                            {
                                NPCEntity = entity,
                                NPCType = npc.NPCType,
                                RegionId = npc.RegionId,
                                Timestamp = currentTime
                            });
                        }
                    }
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void UpdateTerritoryControl(float deltaTime, double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<Territory>()
                .ForEach((Entity entity, int entityInQueryIndex, ref Territory territory) =>
                {
                    if (territory.IsContested)
                    {
                        // Calculate control strength based on nearby players
                        var playersInArea = CountPlayersInArea(territory.Bounds);
                        var ownerPresence = CountOwnerPlayersInArea(territory.Bounds, territory.Owner);
                        
                        var controlChange = (ownerPresence - (playersInArea - ownerPresence)) * deltaTime * 0.1f;
                        territory.ControlStrength = math.clamp(territory.ControlStrength + controlChange, 0f, 1f);

                        // Check if territory changes hands
                        if (territory.ControlStrength <= 0f)
                        {
                            // Territory lost
                            ecb.AddComponent(entityInQueryIndex, entity, new TerritoryLostEvent
                            {
                                TerritoryId = territory.TerritoryId,
                                PreviousOwner = territory.Owner,
                                Timestamp = currentTime
                            });

                            territory.IsContested = false;
                            territory.Owner = Entity.Null;
                            territory.ControlStrength = 0f;
                        }
                        else if (territory.ControlStrength >= 1f)
                        {
                            // Territory secured
                            territory.IsContested = false;
                            territory.ControlStrength = 1f;
                        }
                    }
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void MonitorRegionPopulation(double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<WorldRegion>()
                .ForEach((Entity entity, int entityInQueryIndex, ref WorldRegion region) =>
                {
                    var playerCount = CountPlayersInRegion(region.RegionId);
                    var previousCount = region.CurrentPlayers;
                    region.CurrentPlayers = playerCount;

                    // Check for population changes
                    if (playerCount != previousCount)
                    {
                        ecb.AddComponent(entityInQueryIndex, entity, new RegionPopulationChangedEvent
                        {
                            RegionId = region.RegionId,
                            PreviousCount = previousCount,
                            CurrentCount = playerCount,
                            Timestamp = currentTime
                        });
                    }

                    // Check for overcrowding
                    if (playerCount > region.MaxPlayers)
                    {
                        ecb.AddComponent(entityInQueryIndex, entity, new RegionOvercrowdedEvent
                        {
                            RegionId = region.RegionId,
                            PlayerCount = playerCount,
                            MaxPlayers = region.MaxPlayers,
                            Timestamp = currentTime
                        });
                    }

                    region.LastUpdateTime = currentTime;
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void SetWeatherEffects(ref WeatherData weather)
        {
            switch (weather.Type)
            {
                case WeatherType.Clear:
                    weather.Visibility = 1.0f;
                    weather.MovementModifier = 1.0f;
                    weather.RegenModifier = 1.0f;
                    break;
                case WeatherType.Rain:
                    weather.Visibility = 0.8f;
                    weather.MovementModifier = 0.9f;
                    weather.RegenModifier = 1.1f;
                    break;
                case WeatherType.Storm:
                    weather.Visibility = 0.5f;
                    weather.MovementModifier = 0.7f;
                    weather.RegenModifier = 0.8f;
                    break;
                case WeatherType.Snow:
                    weather.Visibility = 0.7f;
                    weather.MovementModifier = 0.8f;
                    weather.RegenModifier = 0.9f;
                    break;
                case WeatherType.Fog:
                    weather.Visibility = 0.3f;
                    weather.MovementModifier = 1.0f;
                    weather.RegenModifier = 1.0f;
                    break;
                case WeatherType.Sandstorm:
                    weather.Visibility = 0.2f;
                    weather.MovementModifier = 0.6f;
                    weather.RegenModifier = 0.7f;
                    break;
            }

            // Apply intensity modifier
            weather.Visibility = math.lerp(1.0f, weather.Visibility, weather.Intensity);
            weather.MovementModifier = math.lerp(1.0f, weather.MovementModifier, weather.Intensity);
            weather.RegenModifier = math.lerp(1.0f, weather.RegenModifier, weather.Intensity);
        }

        private int CountPlayersInRegion(FixedString32Bytes regionId)
        {
            var count = 0;
            Entities
                .WithAll<Player>()
                .ForEach((in Player player) =>
                {
                    if (player.RegionId.Equals(regionId) && player.IsOnline)
                        count++;
                }).Run();
            return count;
        }

        private int CountPlayersInArea(float4 bounds)
        {
            var count = 0;
            Entities
                .WithAll<Player, LocalTransform>()
                .ForEach((in Player player, in LocalTransform transform) =>
                {
                    if (player.IsOnline &&
                        transform.Position.x >= bounds.x && transform.Position.x <= bounds.z &&
                        transform.Position.z >= bounds.y && transform.Position.z <= bounds.w)
                        count++;
                }).Run();
            return count;
        }

        private int CountOwnerPlayersInArea(float4 bounds, Entity owner)
        {
            var count = 0;
            // This would check guild membership or ownership
            // Implementation depends on how ownership is tracked
            return count;
        }
    }

    // Event components for world system
    [Serializable]
    public struct WeatherChangedEvent : IComponentData
    {
        public FixedString32Bytes RegionId;
        public WeatherType NewWeatherType;
        public float Intensity;
        public double Timestamp;
    }

    [Serializable]
    public struct WorldEventEndedEvent : IComponentData
    {
        public FixedString64Bytes EventId;
        public FixedString32Bytes EventType;
        public FixedString32Bytes RegionId;
        public double Timestamp;
    }

    [Serializable]
    public struct NPCRespawnedEvent : IComponentData
    {
        public Entity NPCEntity;
        public FixedString32Bytes NPCType;
        public FixedString32Bytes RegionId;
        public double Timestamp;
    }

    [Serializable]
    public struct TerritoryLostEvent : IComponentData
    {
        public FixedString64Bytes TerritoryId;
        public Entity PreviousOwner;
        public double Timestamp;
    }

    [Serializable]
    public struct RegionPopulationChangedEvent : IComponentData
    {
        public FixedString32Bytes RegionId;
        public int PreviousCount;
        public int CurrentCount;
        public double Timestamp;
    }

    [Serializable]
    public struct RegionOvercrowdedEvent : IComponentData
    {
        public FixedString32Bytes RegionId;
        public int PlayerCount;
        public int MaxPlayers;
        public double Timestamp;
    }
}
