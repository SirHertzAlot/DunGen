using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Transforms;
using Unity.NetCode;
using System;

namespace MMORPG.Unification.ECS
{
    // Combat-specific components
    [Serializable]
    public struct CombatState : IComponentData
    {
        public Entity CurrentTarget;
        public bool InCombat;
        public float CombatTimer;
        public double LastDamageTime;
        public CombatMode Mode;
        public float Threat; // For aggro management
    }

    [Serializable]
    public struct Weapon : IComponentData
    {
        public WeaponType Type;
        public float MinDamage;
        public float MaxDamage;
        public float AttackSpeed;
        public float Range;
        public float CriticalChance;
        public float CriticalMultiplier;
        public DamageType DamageType;
    }

    [Serializable]
    public struct Armor : IComponentData
    {
        public float PhysicalResistance;
        public float MagicalResistance;
        public float FireResistance;
        public float IceResistance;
        public float PoisonResistance;
        public float HolyResistance;
        public float DurabilityPercent;
    }

    [Serializable]
    public struct StatusEffect : IBufferElementData
    {
        public StatusEffectType Type;
        public float Magnitude;
        public float Duration;
        public float RemainingTime;
        public Entity Source;
        public bool IsStackable;
        public int StackCount;
    }

    [Serializable]
    public struct Skill : IComponentData
    {
        public FixedString32Bytes SkillId;
        public SkillType Type;
        public float Damage;
        public float ManaCost;
        public float Cooldown;
        public float RemainingCooldown;
        public float CastTime;
        public float Range;
        public SkillTargeting Targeting;
    }

    // Combat events
    [Serializable]
    public struct AttackCommand : IRpcCommand
    {
        public Entity Target;
        public FixedString32Bytes SkillId;
        public float3 TargetPosition;
        public double Timestamp;
    }

    [Serializable]
    public struct CastSkillCommand : IRpcCommand
    {
        public FixedString32Bytes SkillId;
        public Entity Target;
        public float3 TargetPosition;
        public double Timestamp;
    }

    [Serializable]
    public struct DamageResult : IComponentData
    {
        public Entity Attacker;
        public Entity Victim;
        public float Damage;
        public DamageType Type;
        public bool IsCritical;
        public bool IsBlocked;
        public bool IsDodged;
        public double Timestamp;
    }

    // Enums
    public enum CombatMode
    {
        Passive,
        Defensive,
        Aggressive,
        Berserk
    }

    public enum WeaponType
    {
        Sword,
        Axe,
        Mace,
        Bow,
        Staff,
        Dagger,
        Spear,
        Unarmed
    }

    public enum StatusEffectType
    {
        Poison,
        Burn,
        Freeze,
        Slow,
        Haste,
        Strength,
        Weakness,
        Shield,
        Regeneration,
        Stun,
        Blind,
        Silence
    }

    public enum SkillType
    {
        Attack,
        Spell,
        Heal,
        Buff,
        Debuff,
        Area,
        Defensive
    }

    public enum SkillTargeting
    {
        Self,
        Enemy,
        Ally,
        Ground,
        Area,
        Cone,
        Line
    }

    // Combat System for authoritative combat resolution
    [UpdateInGroup(typeof(ServerSimulationSystemGroup))]
    public partial class CombatSystem : SystemBase
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

            ProcessAttackCommands(currentTime);
            ProcessSkillCommands(currentTime);
            UpdateCombatStates(deltaTime, currentTime);
            ProcessStatusEffects(deltaTime);
            UpdateSkillCooldowns(deltaTime);
            ProcessDamageEvents(currentTime);
            HandleCombatTimeout(deltaTime, currentTime);
        }

        private void ProcessAttackCommands(double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer();

            foreach (var (attackCmd, requestSource, entity) in 
                     SystemAPI.Query<RefRO<AttackCommand>, RefRO<ReceiveRpcCommandRequestComponent>>()
                     .WithEntityAccess())
            {
                var sourceEntity = requestSource.ValueRO.SourceConnection;
                
                if (ValidateAttackCommand(attackCmd.ValueRO, sourceEntity, currentTime))
                {
                    ExecuteAttack(sourceEntity, attackCmd.ValueRO, currentTime, ecb);
                }

                ecb.DestroyEntity(entity);
            }
        }

        private void ProcessSkillCommands(double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer();

            foreach (var (skillCmd, requestSource, entity) in 
                     SystemAPI.Query<RefRO<CastSkillCommand>, RefRO<ReceiveRpcCommandRequestComponent>>()
                     .WithEntityAccess())
            {
                var sourceEntity = requestSource.ValueRO.SourceConnection;
                
                if (ValidateSkillCommand(skillCmd.ValueRO, sourceEntity, currentTime))
                {
                    ExecuteSkill(sourceEntity, skillCmd.ValueRO, currentTime, ecb);
                }

                ecb.DestroyEntity(entity);
            }
        }

        private void UpdateCombatStates(float deltaTime, double currentTime)
        {
            Entities
                .WithAll<CombatState, Player>()
                .ForEach((ref CombatState combat, ref Player player) =>
                {
                    if (combat.InCombat)
                    {
                        combat.CombatTimer += deltaTime;

                        // Check if target is still valid
                        if (combat.CurrentTarget == Entity.Null || 
                            !HasComponent<Player>(combat.CurrentTarget) ||
                            GetComponent<Player>(combat.CurrentTarget).Health <= 0)
                        {
                            ExitCombat(ref combat);
                        }
                        else
                        {
                            // Check combat range
                            var playerTransform = GetComponent<LocalTransform>(Entity.Null); // Current entity
                            var targetTransform = GetComponent<LocalTransform>(combat.CurrentTarget);
                            var distance = math.distance(playerTransform.Position, targetTransform.Position);

                            if (distance > 15f) // Max combat range
                            {
                                ExitCombat(ref combat);
                            }
                        }

                        // Update threat decay
                        combat.Threat = math.max(0, combat.Threat - deltaTime * 0.5f);
                    }
                }).ScheduleParallel();
        }

        private void ProcessStatusEffects(float deltaTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<Player>()
                .ForEach((Entity entity, int entityInQueryIndex, ref Player player, 
                         ref DynamicBuffer<StatusEffect> statusEffects) =>
                {
                    for (int i = statusEffects.Length - 1; i >= 0; i--)
                    {
                        var effect = statusEffects[i];
                        effect.RemainingTime -= deltaTime;

                        if (effect.RemainingTime <= 0)
                        {
                            // Remove expired effect
                            RemoveStatusEffect(ref player, effect);
                            statusEffects.RemoveAt(i);
                        }
                        else
                        {
                            // Apply effect
                            ApplyStatusEffect(ref player, effect, deltaTime);
                            statusEffects[i] = effect;
                        }
                    }
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void UpdateSkillCooldowns(float deltaTime)
        {
            // Update skill cooldowns for all entities with skills
            // This would be implemented based on how skills are stored per entity
        }

        private void ProcessDamageEvents(double currentTime)
        {
            var ecb = m_EndSimulationEcbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithAll<DamageResult>()
                .ForEach((Entity entity, int entityInQueryIndex, in DamageResult damage) =>
                {
                    if (HasComponent<Player>(damage.Victim))
                    {
                        var victim = GetComponentRW<Player>(damage.Victim);
                        var attacker = HasComponent<Player>(damage.Attacker) ? 
                                     GetComponent<Player>(damage.Attacker) : default;

                        // Apply damage
                        victim.ValueRW.Health = math.max(0, victim.ValueRO.Health - damage.Damage);

                        // Update combat states
                        if (HasComponent<CombatState>(damage.Victim))
                        {
                            var victimCombat = GetComponentRW<CombatState>(damage.Victim);
                            victimCombat.ValueRW.InCombat = true;
                            victimCombat.ValueRW.LastDamageTime = currentTime;
                            
                            if (victimCombat.ValueRO.CurrentTarget == Entity.Null && damage.Attacker != Entity.Null)
                            {
                                victimCombat.ValueRW.CurrentTarget = damage.Attacker;
                            }
                        }

                        if (HasComponent<CombatState>(damage.Attacker))
                        {
                            var attackerCombat = GetComponentRW<CombatState>(damage.Attacker);
                            attackerCombat.ValueRW.InCombat = true;
                            attackerCombat.ValueRW.Threat += damage.Damage * 0.1f;
                        }

                        // Check for death
                        if (victim.ValueRO.Health <= 0)
                        {
                            ecb.AddComponent(entityInQueryIndex, damage.Victim, new PlayerDeathEvent
                            {
                                Killer = damage.Attacker,
                                Timestamp = currentTime
                            });

                            // Grant experience to killer
                            if (damage.Attacker != Entity.Null && HasComponent<Player>(damage.Attacker))
                            {
                                var expGain = victim.ValueRO.Level * 10f; // Base experience formula
                                ecb.AddComponent(entityInQueryIndex, damage.Attacker, new ExperienceGainEvent
                                {
                                    Amount = expGain,
                                    Source = "combat"
                                });
                            }
                        }
                    }

                    // Remove the damage event
                    ecb.RemoveComponent<DamageResult>(entityInQueryIndex, entity);
                }).ScheduleParallel();

            m_EndSimulationEcbSystem.AddJobHandleForProducer(Dependency);
        }

        private void HandleCombatTimeout(float deltaTime, double currentTime)
        {
            Entities
                .WithAll<CombatState>()
                .ForEach((ref CombatState combat) =>
                {
                    if (combat.InCombat)
                    {
                        var timeSinceLastDamage = currentTime - combat.LastDamageTime;
                        
                        // Exit combat if no damage for 10 seconds
                        if (timeSinceLastDamage > 10.0)
                        {
                            ExitCombat(ref combat);
                        }
                    }
                }).ScheduleParallel();
        }

        private bool ValidateAttackCommand(AttackCommand cmd, Entity source, double currentTime)
        {
            // Validate timing
            var timeDiff = currentTime - cmd.Timestamp;
            if (timeDiff > 1.0 || timeDiff < -0.1) return false;

            // Validate source has required components
            if (!HasComponent<Player>(source) || !HasComponent<CombatState>(source))
                return false;

            // Validate target
            if (cmd.Target == Entity.Null || !HasComponent<Player>(cmd.Target))
                return false;

            // Check if target is alive
            var targetPlayer = GetComponent<Player>(cmd.Target);
            if (targetPlayer.Health <= 0) return false;

            // Check range
            var sourceTransform = GetComponent<LocalTransform>(source);
            var targetTransform = GetComponent<LocalTransform>(cmd.Target);
            var distance = math.distance(sourceTransform.Position, targetTransform.Position);
            
            var weapon = HasComponent<Weapon>(source) ? GetComponent<Weapon>(source) : default;
            var maxRange = weapon.Range > 0 ? weapon.Range : 2f; // Default melee range
            
            return distance <= maxRange;
        }

        private bool ValidateSkillCommand(CastSkillCommand cmd, Entity source, double currentTime)
        {
            // Similar validation to attack commands
            var timeDiff = currentTime - cmd.Timestamp;
            if (timeDiff > 1.0 || timeDiff < -0.1) return false;

            if (!HasComponent<Player>(source)) return false;

            var player = GetComponent<Player>(source);
            
            // Check mana cost (would need to look up skill data)
            // This is simplified - in a real system you'd have a skill database
            var manaCost = 10f; // Placeholder
            return player.Mana >= manaCost;
        }

        private void ExecuteAttack(Entity attacker, AttackCommand cmd, double currentTime, EntityCommandBuffer ecb)
        {
            var attackerPlayer = GetComponent<Player>(attacker);
            var attackerStats = HasComponent<PlayerStats>(attacker) ? GetComponent<PlayerStats>(attacker) : default;
            var weapon = HasComponent<Weapon>(attacker) ? GetComponent<Weapon>(attacker) : default;

            // Calculate damage
            var baseDamage = weapon.MinDamage + m_Random.NextFloat() * (weapon.MaxDamage - weapon.MinDamage);
            var statBonus = attackerStats.Strength * 0.5f + attackerStats.Dexterity * 0.3f;
            var totalDamage = baseDamage + statBonus;

            // Check for critical hit
            var isCritical = m_Random.NextFloat() < weapon.CriticalChance;
            if (isCritical)
            {
                totalDamage *= weapon.CriticalMultiplier;
            }

            // Apply armor reduction
            if (HasComponent<Armor>(cmd.Target))
            {
                var armor = GetComponent<Armor>(cmd.Target);
                var resistance = GetResistance(armor, weapon.DamageType);
                totalDamage *= (1f - resistance);
            }

            // Create damage event
            ecb.AddComponent(attacker, new DamageResult
            {
                Attacker = attacker,
                Victim = cmd.Target,
                Damage = totalDamage,
                Type = weapon.DamageType,
                IsCritical = isCritical,
                IsBlocked = false,
                IsDodged = false,
                Timestamp = currentTime
            });

            // Update attacker's last activity
            var player = GetComponentRW<Player>(attacker);
            player.ValueRW.LastActivityTime = currentTime;
        }

        private void ExecuteSkill(Entity caster, CastSkillCommand cmd, double currentTime, EntityCommandBuffer ecb)
        {
            // Simplified skill execution
            // In a real system, this would look up skill data from a database/config
            
            var player = GetComponentRW<Player>(caster);
            player.ValueRW.Mana -= 10f; // Placeholder mana cost
            player.ValueRW.LastActivityTime = currentTime;

            // Apply skill effects based on skill ID
            // This would be much more complex in a real implementation
        }

        private void ExitCombat(ref CombatState combat)
        {
            combat.InCombat = false;
            combat.CurrentTarget = Entity.Null;
            combat.CombatTimer = 0;
            combat.Threat = 0;
        }

        private void ApplyStatusEffect(ref Player player, StatusEffect effect, float deltaTime)
        {
            switch (effect.Type)
            {
                case StatusEffectType.Poison:
                    player.Health = math.max(0, player.Health - effect.Magnitude * deltaTime);
                    break;
                case StatusEffectType.Regeneration:
                    player.Health = math.min(player.MaxHealth, player.Health + effect.Magnitude * deltaTime);
                    break;
                case StatusEffectType.Burn:
                    player.Health = math.max(0, player.Health - effect.Magnitude * deltaTime);
                    break;
                // Add other status effects as needed
            }
        }

        private void RemoveStatusEffect(ref Player player, StatusEffect effect)
        {
            // Remove any lingering effects when status effect expires
            switch (effect.Type)
            {
                case StatusEffectType.Strength:
                    // Would remove strength bonus
                    break;
                case StatusEffectType.Haste:
                    // Would remove speed bonus
                    break;
                // Add cleanup for other effects
            }
        }

        private float GetResistance(Armor armor, DamageType damageType)
        {
            return damageType switch
            {
                DamageType.Physical => armor.PhysicalResistance,
                DamageType.Magical => armor.MagicalResistance,
                DamageType.Fire => armor.FireResistance,
                DamageType.Ice => armor.IceResistance,
                DamageType.Poison => armor.PoisonResistance,
                DamageType.Holy => armor.HolyResistance,
                _ => 0f
            };
        }
    }

    // Death event
    [Serializable]
    public struct PlayerDeathEvent : IComponentData
    {
        public Entity Killer;
        public double Timestamp;
    }
}
