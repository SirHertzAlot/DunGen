using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;
using System;
using System.Collections.Generic;

namespace MMORPG.Unification.Tick
{
    /// <summary>
    /// Authoritative game tick system for synchronized server simulation
    /// Manages tick rate, simulation timing, and tick-based event processing
    /// </summary>
    [UpdateInGroup(typeof(ServerSimulationSystemGroup))]
    public partial class GameTickSystem : SystemBase
    {
        private double _lastTickTime;
        private uint _currentTick;
        private float _tickRate;
        private float _targetDeltaTime;
        private List<TickEvent> _scheduledEvents;
        private Dictionary<uint, List<TickCallback>> _tickCallbacks;
        private TickStatistics _statistics;

        public uint CurrentTick => _currentTick;
        public float TickRate => _tickRate;
        public double LastTickTime => _lastTickTime;

        protected override void OnCreate()
        {
            _tickRate = 60f; // 60 TPS default
            _targetDeltaTime = 1f / _tickRate;
            _scheduledEvents = new List<TickEvent>();
            _tickCallbacks = new Dictionary<uint, List<TickCallback>>();
            _statistics = new TickStatistics();
            _lastTickTime = SystemAPI.Time.ElapsedTime;
            
            RequireForUpdate<NetworkTime>();
        }

        protected override void OnUpdate()
        {
            var networkTime = SystemAPI.GetSingleton<NetworkTime>();
            var currentTime = SystemAPI.Time.ElapsedTime;
            var deltaTime = SystemAPI.Time.DeltaTime;

            // Update tick timing
            UpdateTickTiming(currentTime, deltaTime);

            // Process scheduled events for this tick
            ProcessScheduledEvents();

            // Execute tick callbacks
            ExecuteTickCallbacks();

            // Update tick statistics
            UpdateStatistics(deltaTime);

            // Broadcast tick update to all systems
            BroadcastTickUpdate(networkTime);

            _currentTick++;
            _lastTickTime = currentTime;
        }

        private void UpdateTickTiming(double currentTime, float deltaTime)
        {
            // Adaptive tick rate based on server load
            var targetFrameTime = 1f / _tickRate;
            var actualFrameTime = deltaTime;
            
            // Adjust tick rate if we're consistently running slow
            if (actualFrameTime > targetFrameTime * 1.1f)
            {
                _statistics.SlowTicks++;
                
                // Reduce tick rate if we've had too many slow ticks
                if (_statistics.SlowTicks > 60) // 1 second of slow ticks
                {
                    _tickRate = math.max(30f, _tickRate * 0.95f); // Min 30 TPS
                    _targetDeltaTime = 1f / _tickRate;
                    _statistics.SlowTicks = 0;
                    _statistics.TickRateAdjustments++;
                }
            }
            else if (actualFrameTime < targetFrameTime * 0.9f && _tickRate < 60f)
            {
                // Increase tick rate if we're running fast and below target
                _tickRate = math.min(60f, _tickRate * 1.01f);
                _targetDeltaTime = 1f / _tickRate;
            }

            _statistics.AverageFrameTime = (_statistics.AverageFrameTime * 0.99f) + (actualFrameTime * 0.01f);
        }

        private void ProcessScheduledEvents()
        {
            for (int i = _scheduledEvents.Count - 1; i >= 0; i--)
            {
                var tickEvent = _scheduledEvents[i];
                
                if (tickEvent.ExecuteTick <= _currentTick)
                {
                    try
                    {
                        ExecuteTickEvent(tickEvent);
                        _statistics.EventsProcessed++;
                    }
                    catch (Exception ex)
                    {
                        UnityEngine.Debug.LogError($"Error executing tick event: {ex.Message}");
                        _statistics.EventErrors++;
                    }
                    
                    _scheduledEvents.RemoveAt(i);
                }
            }
        }

        private void ExecuteTickCallbacks()
        {
            if (_tickCallbacks.TryGetValue(_currentTick, out var callbacks))
            {
                foreach (var callback in callbacks)
                {
                    try
                    {
                        callback.Execute();
                        _statistics.CallbacksExecuted++;
                    }
                    catch (Exception ex)
                    {
                        UnityEngine.Debug.LogError($"Error executing tick callback: {ex.Message}");
                        _statistics.CallbackErrors++;
                    }
                }
                
                _tickCallbacks.Remove(_currentTick);
            }
        }

        private void UpdateStatistics(float deltaTime)
        {
            _statistics.TotalTicks++;
            _statistics.TotalTime += deltaTime;
            
            if (_statistics.TotalTicks % 60 == 0) // Every second
            {
                _statistics.CurrentTPS = 1f / _statistics.AverageFrameTime;
                
                // Reset counters for next second
                _statistics.EventsProcessedPerSecond = _statistics.EventsProcessed;
                _statistics.CallbacksExecutedPerSecond = _statistics.CallbacksExecuted;
                _statistics.EventsProcessed = 0;
                _statistics.CallbacksExecuted = 0;
            }
        }

        private void BroadcastTickUpdate(NetworkTime networkTime)
        {
            // Create tick update component for other systems to consume
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                .CreateCommandBuffer(World.Unmanaged);

            var tickUpdate = ecb.CreateEntity();
            ecb.AddComponent(tickUpdate, new TickUpdateEvent
            {
                TickNumber = _currentTick,
                ServerTime = networkTime.ServerTick.ToFixedtimeSeconds(),
                DeltaTime = SystemAPI.Time.DeltaTime,
                TickRate = _tickRate
            });
        }

        private void ExecuteTickEvent(TickEvent tickEvent)
        {
            switch (tickEvent.Type)
            {
                case TickEventType.PlayerRespawn:
                    HandlePlayerRespawn(tickEvent);
                    break;
                case TickEventType.CombatTimeout:
                    HandleCombatTimeout(tickEvent);
                    break;
                case TickEventType.StatusEffectExpire:
                    HandleStatusEffectExpire(tickEvent);
                    break;
                case TickEventType.ResourceRespawn:
                    HandleResourceRespawn(tickEvent);
                    break;
                case TickEventType.WorldEvent:
                    HandleWorldEvent(tickEvent);
                    break;
                case TickEventType.MaintenanceWarning:
                    HandleMaintenanceWarning(tickEvent);
                    break;
                default:
                    UnityEngine.Debug.LogWarning($"Unknown tick event type: {tickEvent.Type}");
                    break;
            }
        }

        // Public API for scheduling events
        public void ScheduleEvent(TickEventType eventType, uint delayTicks, Entity target = default, 
                                 object data = null)
        {
            var tickEvent = new TickEvent
            {
                Type = eventType,
                ExecuteTick = _currentTick + delayTicks,
                Target = target,
                Data = data,
                ScheduledTick = _currentTick
            };
            
            _scheduledEvents.Add(tickEvent);
        }

        public void ScheduleEventAtTime(TickEventType eventType, double targetTime, Entity target = default, 
                                       object data = null)
        {
            var delayTicks = (uint)math.max(0, (targetTime - _lastTickTime) * _tickRate);
            ScheduleEvent(eventType, delayTicks, target, data);
        }

        public void ScheduleCallback(uint targetTick, Action callback)
        {
            if (!_tickCallbacks.TryGetValue(targetTick, out var callbacks))
            {
                callbacks = new List<TickCallback>();
                _tickCallbacks[targetTick] = callbacks;
            }
            
            callbacks.Add(new TickCallback { Action = callback });
        }

        public void ScheduleRepeatingEvent(TickEventType eventType, uint intervalTicks, 
                                          Entity target = default, object data = null, 
                                          uint maxRepeats = uint.MaxValue)
        {
            var repeatingEvent = new RepeatingTickEvent
            {
                BaseEvent = new TickEvent
                {
                    Type = eventType,
                    ExecuteTick = _currentTick + intervalTicks,
                    Target = target,
                    Data = data,
                    ScheduledTick = _currentTick
                },
                IntervalTicks = intervalTicks,
                RemainingRepeats = maxRepeats
            };

            // Schedule first execution
            ScheduleEvent(eventType, intervalTicks, target, repeatingEvent);
        }

        // Event handlers
        private void HandlePlayerRespawn(TickEvent tickEvent)
        {
            if (tickEvent.Target != Entity.Null && HasComponent<Player>(tickEvent.Target))
            {
                var player = GetComponentRW<Player>(tickEvent.Target);
                player.ValueRW.Health = player.ValueRO.MaxHealth;
                player.ValueRW.Mana = player.ValueRO.MaxMana;
                
                // Reset position to spawn point
                if (HasComponent<LocalTransform>(tickEvent.Target))
                {
                    var transform = GetComponentRW<LocalTransform>(tickEvent.Target);
                    transform.ValueRW.Position = GetSpawnPosition(player.ValueRO.RegionId);
                }
            }
        }

        private void HandleCombatTimeout(TickEvent tickEvent)
        {
            if (tickEvent.Target != Entity.Null && HasComponent<CombatState>(tickEvent.Target))
            {
                var combat = GetComponentRW<CombatState>(tickEvent.Target);
                combat.ValueRW.InCombat = false;
                combat.ValueRW.CurrentTarget = Entity.Null;
                combat.ValueRW.CombatTimer = 0;
            }
        }

        private void HandleStatusEffectExpire(TickEvent tickEvent)
        {
            if (tickEvent.Data is StatusEffectExpireData expireData)
            {
                // Remove specific status effect
                if (HasBuffer<StatusEffect>(tickEvent.Target))
                {
                    var statusEffects = GetBuffer<StatusEffect>(tickEvent.Target);
                    for (int i = statusEffects.Length - 1; i >= 0; i--)
                    {
                        if (statusEffects[i].Type == expireData.EffectType)
                        {
                            statusEffects.RemoveAt(i);
                            break;
                        }
                    }
                }
            }
        }

        private void HandleResourceRespawn(TickEvent tickEvent)
        {
            if (tickEvent.Target != Entity.Null && HasComponent<ResourceNode>(tickEvent.Target))
            {
                var resource = GetComponentRW<ResourceNode>(tickEvent.Target);
                resource.ValueRW.IsAvailable = true;
                resource.ValueRW.Quantity = resource.ValueRO.MaxQuantity;
                resource.ValueRW.TimeUntilRespawn = 0;
            }
        }

        private void HandleWorldEvent(TickEvent tickEvent)
        {
            if (tickEvent.Data is WorldEventData eventData)
            {
                // Trigger world event
                var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                    .CreateCommandBuffer(World.Unmanaged);

                var worldEventEntity = ecb.CreateEntity();
                ecb.AddComponent(worldEventEntity, new WorldEvent
                {
                    EventId = eventData.EventId,
                    EventType = eventData.EventType,
                    Name = eventData.Name,
                    Description = eventData.Description,
                    Duration = eventData.Duration,
                    RemainingTime = eventData.Duration,
                    IsGlobal = eventData.IsGlobal,
                    RegionId = eventData.RegionId,
                    Phase = EventPhase.Preparation
                });
            }
        }

        private void HandleMaintenanceWarning(TickEvent tickEvent)
        {
            // Broadcast maintenance warning to all players
            // This would typically send a message through the event bus
            UnityEngine.Debug.Log($"Maintenance warning: {tickEvent.Data}");
        }

        // Utility methods
        private float3 GetSpawnPosition(FixedString32Bytes regionId)
        {
            // Return default spawn position for region
            // In a real implementation, this would look up region spawn points
            return new float3(0, 0, 0);
        }

        public TickStatistics GetStatistics()
        {
            return _statistics;
        }

        public void SetTickRate(float newTickRate)
        {
            _tickRate = math.clamp(newTickRate, 10f, 120f); // Limit between 10-120 TPS
            _targetDeltaTime = 1f / _tickRate;
        }

        public uint GetTicksUntilTime(double targetTime)
        {
            var timeDiff = targetTime - _lastTickTime;
            return (uint)math.max(0, timeDiff * _tickRate);
        }

        public double GetTimeFromTicks(uint ticks)
        {
            return ticks / _tickRate;
        }
    }

    // Data structures
    [Serializable]
    public struct TickUpdateEvent : IComponentData
    {
        public uint TickNumber;
        public double ServerTime;
        public float DeltaTime;
        public float TickRate;
    }

    public enum TickEventType
    {
        PlayerRespawn,
        CombatTimeout,
        StatusEffectExpire,
        ResourceRespawn,
        WorldEvent,
        MaintenanceWarning,
        RegionShutdown,
        BossSpawn,
        TreasureSpawn,
        WeatherChange
    }

    public struct TickEvent
    {
        public TickEventType Type;
        public uint ExecuteTick;
        public uint ScheduledTick;
        public Entity Target;
        public object Data;
    }

    public struct RepeatingTickEvent
    {
        public TickEvent BaseEvent;
        public uint IntervalTicks;
        public uint RemainingRepeats;
    }

    public struct TickCallback
    {
        public Action Action;

        public void Execute()
        {
            Action?.Invoke();
        }
    }

    public class TickStatistics
    {
        public uint TotalTicks;
        public float TotalTime;
        public float AverageFrameTime;
        public float CurrentTPS;
        public uint SlowTicks;
        public uint TickRateAdjustments;
        public uint EventsProcessed;
        public uint EventsProcessedPerSecond;
        public uint EventErrors;
        public uint CallbacksExecuted;
        public uint CallbacksExecutedPerSecond;
        public uint CallbackErrors;
    }

    // Event data structures
    public class StatusEffectExpireData
    {
        public StatusEffectType EffectType;
        public Entity Source;
    }

    public class WorldEventData
    {
        public FixedString64Bytes EventId;
        public FixedString32Bytes EventType;
        public FixedString64Bytes Name;
        public FixedString512Bytes Description;
        public float Duration;
        public bool IsGlobal;
        public FixedString32Bytes RegionId;
    }
}
