using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Transforms;
using Unity.NetCode;
using System;

namespace MMORPG.Unification.ECS
{
    // Player component data
    [Serializable]
    public struct Player : IComponentData
    {
        public FixedString64Bytes Username;
        public int Level;
        public float Experience;
        public float Health;
        public float MaxHealth;
        public float Mana;
        public float MaxMana;
        public FixedString32Bytes RegionId;
        public bool IsOnline;
        public double LastActivityTime;
        public int GuildId;
    }

    [Serializable]
    public struct PlayerStats : IComponentData
    {
        public int Strength;
        public int Dexterity;
        public int Intelligence;
        public int Vitality;
        public int Energy;
        public int Luck;
    }

    [Serializable]
    public struct PlayerMovement : IComponentData
    {
        public float3 Velocity;
        public float Speed;
        public float3 TargetPosition;
        public bool IsMoving;
        public double LastMoveTime;
    }

    [Serializable]
    public struct PlayerCombat : IComponentData
    {
        public Entity Target;
        public float AttackDamage;
        public float AttackSpeed;
        public double LastAttackTime;
        public bool InCombat;
        public double CombatStartTime;
    }

    [Serializable]
    public struct PlayerInventory : IBufferElementData
    {
        public int SlotIndex;
        public FixedString64Bytes ItemId;
        public int Quantity;
        public FixedString32Bytes ItemType;
    }

    // Player input events
    [Serializable]
    public struct PlayerMoveEvent : IRpcCommand
    {
        public float3 TargetPosition;
        public FixedString32Bytes RegionId;
        public double Timestamp;
    }

    [Serializable]
    public struct PlayerAttackEvent : IRpcCommand
    {
        public Entity Target;
        public FixedString32Bytes SkillId;
        public double Timestamp;
    }

    [Serializable]
    public struct PlayerUseItemEvent : IRpcCommand
    {
        public int SlotIndex;
        public FixedString64Bytes ItemId;
        public double Timestamp;
    }

    // Player System for authoritative server logic
    [UpdateInGroup(typeof(ServerSimulationSystemGroup))]
    public partial class PlayerSystem : SystemBase
    {
        private EndSimulationEntityCommandBufferSystem m_EndSimulationEcbSystem;
        private BeginSimulationEntityCommandBufferSystem m_BeginSimulationEcbSystem;
        
        protected override void OnCreate()
        {
            m_EndSimulationEcbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
            m_BeginSimulationEcbSystem = World.GetOrCreateSystem<BeginSimulationEntityCommandBufferSystem>();
            
            RequireForUpdate<NetworkTime>();
        }

        protected override void OnUpdate()
        {
            var deltaTime = SystemAPI.Time.DeltaTime;
            var networkTime = SystemAPI.GetSingleton<NetworkTime>();
            var currentTime = networkTime.ServerTick.ToFixedtimeSeconds();
            
            ProcessPlayerMovement(deltaTime, currentTime);
            ProcessPlayerCombat(deltaTime, currentTime);
            ProcessPlayerHealth(deltaTime);
            ProcessPlayerExperience();
            ValidatePlayerStates(currentTime);
        }

        private void ProcessPlayerMovement(float deltaTime, double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<Player, PlayerMovement, LocalTransform>()
                .ForEach((Entity entity, int entityInQueryIndex, ref LocalTransform transform, 
                         ref PlayerMovement movement, in Player player) =>
                {
                    if (movement.IsMoving)
                    {
                        var direction = movement.TargetPosition - transform.Position;
                        var distance = math.length(direction);

                        if (distance > 0.1f)
                        {
                            var normalizedDirection = math.normalize(direction);
                            var moveDistance = movement.Speed * deltaTime;
                            
                            if (moveDistance >= distance)
                            {
                                // Reached target
                                transform.Position = movement.TargetPosition;
                                movement.IsMoving = false;
                                
                                // Trigger position update event
                                ecb.AddComponent(entityInQueryIndex, entity, new PlayerPositionChanged
                                {
                                    NewPosition = movement.TargetPosition,
                                    RegionId = player.RegionId,
                                    Timestamp = currentTime
                                });
                            }
                            else
                            {
                                // Continue moving
                                transform.Position += normalizedDirection * moveDistance;
                                movement.Velocity = normalizedDirection * movement.Speed;
                            }
                        }
                        else
                        {
                            movement.IsMoving = false;
                            movement.Velocity = float3.zero;
                        }
                    }
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void ProcessPlayerCombat(float deltaTime, double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<Player, PlayerCombat, PlayerStats>()
                .ForEach((Entity entity, int entityInQueryIndex, ref Player player, 
                         ref PlayerCombat combat, in PlayerStats stats) =>
                {
                    if (combat.InCombat)
                    {
                        // Check if target is still valid and in range
                        if (combat.Target == Entity.Null || 
                            !HasComponent<Player>(combat.Target) ||
                            !HasComponent<LocalTransform>(combat.Target))
                        {
                            // End combat - invalid target
                            combat.InCombat = false;
                            combat.Target = Entity.Null;
                            return;
                        }

                        var playerTransform = GetComponent<LocalTransform>(entity);
                        var targetTransform = GetComponent<LocalTransform>(combat.Target);
                        var distance = math.distance(playerTransform.Position, targetTransform.Position);

                        // Check combat range (10 units max)
                        if (distance > 10f)
                        {
                            combat.InCombat = false;
                            combat.Target = Entity.Null;
                            return;
                        }

                        // Check if can attack (cooldown)
                        var timeSinceLastAttack = currentTime - combat.LastAttackTime;
                        var attackCooldown = 1.0f / combat.AttackSpeed;

                        if (timeSinceLastAttack >= attackCooldown)
                        {
                            // Calculate damage
                            var baseDamage = combat.AttackDamage;
                            var statBonus = stats.Strength * 0.1f + stats.Dexterity * 0.05f;
                            var totalDamage = baseDamage + statBonus;

                            // Apply damage to target
                            ecb.AddComponent(entityInQueryIndex, entity, new DamageEvent
                            {
                                Target = combat.Target,
                                Damage = totalDamage,
                                Source = entity,
                                DamageType = DamageType.Physical,
                                Timestamp = currentTime
                            });

                            combat.LastAttackTime = currentTime;
                        }
                    }
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void ProcessPlayerHealth(float deltaTime)
        {
            Entities
                .WithAll<Player>()
                .ForEach((ref Player player) =>
                {
                    // Health regeneration when not in combat
                    if (!HasComponent<PlayerCombat>(Entity.Null) || 
                        !GetComponent<PlayerCombat>(Entity.Null).InCombat)
                    {
                        var regenRate = player.MaxHealth * 0.02f; // 2% per second
                        player.Health = math.min(player.MaxHealth, player.Health + regenRate * deltaTime);
                    }

                    // Mana regeneration
                    var manaRegenRate = player.MaxMana * 0.05f; // 5% per second
                    player.Mana = math.min(player.MaxMana, player.Mana + manaRegenRate * deltaTime);

                    // Check if player died
                    if (player.Health <= 0 && player.IsOnline)
                    {
                        // Handle player death
                        player.Health = 0;
                        // Trigger death event
                    }
                }).ScheduleParallel();
        }

        private void ProcessPlayerExperience()
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<Player, ExperienceGainEvent>()
                .ForEach((Entity entity, int entityInQueryIndex, ref Player player, 
                         in ExperienceGainEvent expEvent) =>
                {
                    player.Experience += expEvent.Amount;

                    // Check for level up
                    var expRequired = CalculateExperienceRequired(player.Level);
                    if (player.Experience >= expRequired)
                    {
                        player.Level++;
                        player.Experience -= expRequired;

                        // Increase max health and mana
                        player.MaxHealth += 10 + player.Level * 2;
                        player.MaxMana += 5 + player.Level;
                        player.Health = player.MaxHealth; // Full heal on level up
                        player.Mana = player.MaxMana;

                        // Trigger level up event
                        ecb.AddComponent(entityInQueryIndex, entity, new PlayerLevelUpEvent
                        {
                            NewLevel = player.Level,
                            ExperienceGained = expEvent.Amount
                        });
                    }

                    // Remove the experience gain event
                    ecb.RemoveComponent<ExperienceGainEvent>(entityInQueryIndex, entity);
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void ValidatePlayerStates(double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<Player>()
                .ForEach((Entity entity, int entityInQueryIndex, ref Player player) =>
                {
                    // Validate health bounds
                    player.Health = math.clamp(player.Health, 0, player.MaxHealth);
                    player.Mana = math.clamp(player.Mana, 0, player.MaxMana);

                    // Check for inactive players (30 seconds timeout)
                    var inactiveTime = currentTime - player.LastActivityTime;
                    if (inactiveTime > 30.0 && player.IsOnline)
                    {
                        player.IsOnline = false;
                        
                        // Trigger player timeout event
                        ecb.AddComponent(entityInQueryIndex, entity, new PlayerTimeoutEvent
                        {
                            PlayerId = entity,
                            LastActivity = player.LastActivityTime
                        });
                    }

                    // Validate level bounds
                    player.Level = math.clamp(player.Level, 1, 100);

                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private float CalculateExperienceRequired(int level)
        {
            // Exponential experience curve
            return 100 * level * level + 50 * level;
        }
    }

    // Event components
    [Serializable]
    public struct PlayerPositionChanged : IComponentData
    {
        public float3 NewPosition;
        public FixedString32Bytes RegionId;
        public double Timestamp;
    }

    [Serializable]
    public struct DamageEvent : IComponentData
    {
        public Entity Target;
        public float Damage;
        public Entity Source;
        public DamageType DamageType;
        public double Timestamp;
    }

    [Serializable]
    public struct ExperienceGainEvent : IComponentData
    {
        public float Amount;
        public FixedString32Bytes Source; // "combat", "quest", "exploration"
    }

    [Serializable]
    public struct PlayerLevelUpEvent : IComponentData
    {
        public int NewLevel;
        public float ExperienceGained;
    }

    [Serializable]
    public struct PlayerTimeoutEvent : IComponentData
    {
        public Entity PlayerId;
        public double LastActivity;
    }

    public enum DamageType
    {
        Physical,
        Magical,
        Fire,
        Ice,
        Poison,
        Holy
    }

    // RPC Systems for handling player input
    [UpdateInGroup(typeof(ServerSimulationSystemGroup))]
    public partial class PlayerInputSystem : SystemBase
    {
        private EndSimulationEntityCommandBufferSystem m_EndSimulationEcbSystem;

        protected override void OnCreate()
        {
            m_EndSimulationEcbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
        }

        protected override void OnUpdate()
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer();
            var networkTime = SystemAPI.GetSingleton<NetworkTime>();
            var currentTime = networkTime.ServerTick.ToFixedtimeSeconds();

            // Process move commands
            foreach (var (moveEvent, requestSource, entity) in 
                     SystemAPI.Query<RefRO<PlayerMoveEvent>, RefRO<ReceiveRpcCommandRequestComponent>>()
                     .WithEntityAccess())
            {
                if (HasComponent<Player>(requestSource.ValueRO.SourceConnection) && 
                    HasComponent<PlayerMovement>(requestSource.ValueRO.SourceConnection))
                {
                    var player = GetComponentRW<Player>(requestSource.ValueRO.SourceConnection);
                    var movement = GetComponentRW<PlayerMovement>(requestSource.ValueRO.SourceConnection);
                    
                    // Validate movement (anti-cheat)
                    if (ValidateMovement(moveEvent.ValueRO, player.ValueRO, currentTime))
                    {
                        movement.ValueRW.TargetPosition = moveEvent.ValueRO.TargetPosition;
                        movement.ValueRW.IsMoving = true;
                        player.ValueRW.LastActivityTime = currentTime;
                    }
                }

                ecb.DestroyEntity(entity);
            }

            // Process attack commands
            foreach (var (attackEvent, requestSource, entity) in 
                     SystemAPI.Query<RefRO<PlayerAttackEvent>, RefRO<ReceiveRpcCommandRequestComponent>>()
                     .WithEntityAccess())
            {
                if (HasComponent<Player>(requestSource.ValueRO.SourceConnection) && 
                    HasComponent<PlayerCombat>(requestSource.ValueRO.SourceConnection))
                {
                    var player = GetComponentRW<Player>(requestSource.ValueRO.SourceConnection);
                    var combat = GetComponentRW<PlayerCombat>(requestSource.ValueRO.SourceConnection);
                    
                    // Validate attack target and range
                    if (ValidateAttack(attackEvent.ValueRO, requestSource.ValueRO.SourceConnection))
                    {
                        combat.ValueRW.Target = attackEvent.ValueRO.Target;
                        combat.ValueRW.InCombat = true;
                        combat.ValueRW.CombatStartTime = currentTime;
                        player.ValueRW.LastActivityTime = currentTime;
                    }
                }

                ecb.DestroyEntity(entity);
            }

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private bool ValidateMovement(PlayerMoveEvent moveEvent, Player player, double currentTime)
        {
            // Basic anti-cheat: check time and distance
            var timeDiff = currentTime - moveEvent.Timestamp;
            if (timeDiff > 1.0) // Reject old commands
                return false;

            // Additional validation logic would go here
            return true;
        }

        private bool ValidateAttack(PlayerAttackEvent attackEvent, Entity sourcePlayer)
        {
            // Validate target exists and is in range
            if (!HasComponent<Player>(attackEvent.Target))
                return false;

            var playerTransform = GetComponent<LocalTransform>(sourcePlayer);
            var targetTransform = GetComponent<LocalTransform>(attackEvent.Target);
            var distance = math.distance(playerTransform.Position, targetTransform.Position);

            return distance <= 10f; // Max attack range
        }
    }
}
