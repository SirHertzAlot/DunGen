import { ISystem } from './ISystem';
import { Entity } from '../entities/Entity';
import { 
  TransformComponent, 
  HealthComponent, 
  CombatComponent, 
  StatsComponent,
  MovementComponent,
  AIComponent
} from '../components/CoreComponents';
import { v4 as uuidv4 } from 'uuid';

// Combat action types for super fast live action combat
export interface CombatAction {
  id: string;
  traceId: string; // for debugging
  actorId: string;
  targetId?: string;
  actionType: 'attack' | 'spell' | 'move' | 'dash' | 'dodge' | 'disengage';
  timestamp: number;
  data: any;
}

export interface AttackResult {
  hit: boolean;
  damage: number;
  critical: boolean;
  damageType: string;
  effects: string[];
}

export interface CombatEncounter {
  id: string;
  participants: string[]; // entity IDs
  initiative: { entityId: string; roll: number }[];
  currentTurn: number;
  round: number;
  startTime: number;
  status: 'starting' | 'active' | 'ended';
  turnTimeLimit: number; // milliseconds
  lastActionTime: number;
}

// High-performance combat system for D&D live action
export class CombatSystem implements ISystem {
  public readonly systemType = 'Combat';
  private activeCombats: Map<string, CombatEncounter> = new Map();
  private actionQueue: CombatAction[] = [];
  private lastUpdate: number = 0;
  private readonly UPDATE_INTERVAL = 16; // ~60 FPS for smooth combat

  async update(entities: Map<string, Entity>, deltaTime: number): Promise<void> {
    const now = Date.now();
    
    // High-frequency updates for responsive combat
    if (now - this.lastUpdate < this.UPDATE_INTERVAL) {
      return;
    }

    // Process queued actions first (most critical)
    await this.processActionQueue(entities);
    
    // Update active combats
    await this.updateActiveCombats(entities, deltaTime);
    
    // Check for new combat opportunities
    await this.checkCombatInitiation(entities);
    
    // Update AI combat decisions
    await this.updateAICombat(entities);

    this.lastUpdate = now;
  }

  // Process combat actions in order (FIFO for fairness)
  private async processActionQueue(entities: Map<string, Entity>): Promise<void> {
    while (this.actionQueue.length > 0) {
      const action = this.actionQueue.shift()!;
      await this.executeAction(action, entities);
    }
  }

  // Execute a single combat action
  private async executeAction(action: CombatAction, entities: Map<string, Entity>): Promise<void> {
    const actor = entities.get(action.actorId);
    if (!actor) return;

    const combat = actor.getComponent<CombatComponent>('Combat');
    const transform = actor.getComponent<TransformComponent>('Transform');
    
    if (!combat || !transform) return;

    const processingStart = Date.now();

    try {
      switch (action.actionType) {
        case 'attack':
          await this.executeAttack(action, actor, entities);
          break;
        case 'spell':
          await this.executeSpell(action, actor, entities);
          break;
        case 'move':
          await this.executeMovement(action, actor, entities);
          break;
        case 'dash':
          await this.executeDash(action, actor, entities);
          break;
        case 'dodge':
          await this.executeDodge(action, actor, entities);
          break;
        case 'disengage':
          await this.executeDisengage(action, actor, entities);
          break;
      }

      // Track processing time for performance optimization
      const processingTime = Date.now() - processingStart;
      if (processingTime > 5) { // Log slow actions
        console.warn(`Slow combat action: ${action.actionType} took ${processingTime}ms`);
      }

    } catch (error) {
      console.error(`Error executing combat action ${action.id}:`, error);
    }
  }

  // Fast melee/ranged attack execution
  private async executeAttack(action: CombatAction, actor: Entity, entities: Map<string, Entity>): Promise<AttackResult> {
    const target = action.targetId ? entities.get(action.targetId) : undefined;
    if (!target) {
      return { hit: false, damage: 0, critical: false, damageType: 'none', effects: [] };
    }

    const actorStats = actor.getComponent<StatsComponent>('Stats');
    const actorCombat = actor.getComponent<CombatComponent>('Combat');
    const targetHealth = target.getComponent<HealthComponent>('Health');
    const targetTransform = target.getComponent<TransformComponent>('Transform');

    if (!actorStats || !actorCombat || !targetHealth || !targetTransform) {
      return { hit: false, damage: 0, critical: false, damageType: 'none', effects: [] };
    }

    // Fast attack roll calculation
    const attackBonus = actorStats.getModifier('strength') + 2; // simplified proficiency
    const attackRoll = this.rollD20() + attackBonus;
    const targetAC = targetHealth.armorClass;

    const critical = attackRoll >= 20;
    const hit = critical || attackRoll >= targetAC;

    if (!hit) {
      return { hit: false, damage: 0, critical: false, damageType: 'slashing', effects: [] };
    }

    // Fast damage calculation
    let damage = this.rollDice(1, 8) + actorStats.getModifier('strength'); // longsword
    if (critical) {
      damage += this.rollDice(1, 8); // extra die for crit
    }

    // Apply damage
    const actualDamage = targetHealth.takeDamage(damage);

    // Check for death
    const effects: string[] = [];
    if (!targetHealth.isAlive()) {
      effects.push('death');
      await this.handleDeath(target, entities);
    }

    // Use actor's action
    actorCombat.useAction();

    return {
      hit: true,
      damage: actualDamage,
      critical,
      damageType: 'slashing',
      effects
    };
  }

  private async executeSpell(action: CombatAction, actor: Entity, entities: Map<string, Entity>): Promise<void> {
    // Simplified spell casting for now
    const combat = actor.getComponent<CombatComponent>('Combat');
    if (combat) {
      combat.useAction();
    }
    // TODO: Implement full spell system
  }

  private async executeMovement(action: CombatAction, actor: Entity, entities: Map<string, Entity>): Promise<void> {
    const transform = actor.getComponent<TransformComponent>('Transform');
    const movement = actor.getComponent<MovementComponent>('Movement');
    
    if (!transform || !movement || !action.data.targetPosition) return;

    const { x, y, z } = action.data.targetPosition;
    const distance = this.calculateDistance(transform.position, { x, y, z });

    if (movement.useMovement(distance)) {
      transform.setPosition(x, y, z);
      
      // Check for attacks of opportunity
      await this.checkAttacksOfOpportunity(actor, entities);
    }
  }

  private async executeDash(action: CombatAction, actor: Entity, entities: Map<string, Entity>): Promise<void> {
    const movement = actor.getComponent<MovementComponent>('Movement');
    const combat = actor.getComponent<CombatComponent>('Combat');
    
    if (movement && combat && combat.useAction()) {
      movement.currentMovement += movement.speed; // double movement
    }
  }

  private async executeDodge(action: CombatAction, actor: Entity, entities: Map<string, Entity>): Promise<void> {
    const combat = actor.getComponent<CombatComponent>('Combat');
    if (combat) {
      combat.useAction();
      // TODO: Add dodge effect (advantage on Dex saves, attackers have disadvantage)
    }
  }

  private async executeDisengage(action: CombatAction, actor: Entity, entities: Map<string, Entity>): Promise<void> {
    const combat = actor.getComponent<CombatComponent>('Combat');
    if (combat) {
      combat.useAction();
      // TODO: Add disengaged status (no attacks of opportunity)
    }
  }

  // Check for attacks of opportunity when moving
  private async checkAttacksOfOpportunity(mover: Entity, entities: Map<string, Entity>): Promise<void> {
    const moverTransform = mover.getComponent<TransformComponent>('Transform');
    if (!moverTransform) return;

    for (const [id, entity] of entities) {
      if (id === mover.id) continue;

      const combat = entity.getComponent<CombatComponent>('Combat');
      const transform = entity.getComponent<TransformComponent>('Transform');
      
      if (!combat || !transform || !combat.canTakeReaction()) continue;

      const distance = this.calculateDistance(moverTransform.position, transform.position);
      if (distance <= 5) { // 5 foot reach
        // Trigger attack of opportunity
        const action: CombatAction = {
          id: uuidv4(),
          traceId: uuidv4(),
          actorId: entity.id,
          targetId: mover.id,
          actionType: 'attack',
          timestamp: Date.now(),
          data: { opportunityAttack: true }
        };

        await this.executeAction(action, entities);
        combat.useReaction();
      }
    }
  }

  // Update active combat encounters
  private async updateActiveCombats(entities: Map<string, Entity>, deltaTime: number): Promise<void> {
    for (const [combatId, encounter] of this.activeCombats) {
      await this.updateEncounter(encounter, entities, deltaTime);
    }
  }

  private async updateEncounter(encounter: CombatEncounter, entities: Map<string, Entity>, deltaTime: number): Promise<void> {
    if (encounter.status !== 'active') return;

    const now = Date.now();
    const timeSinceLastAction = now - encounter.lastActionTime;

    // Auto-advance turn if time limit exceeded
    if (timeSinceLastAction > encounter.turnTimeLimit) {
      await this.advanceTurn(encounter, entities);
    }

    // Check for combat end conditions
    if (await this.checkCombatEnd(encounter, entities)) {
      await this.endCombat(encounter, entities);
    }
  }

  private async advanceTurn(encounter: CombatEncounter, entities: Map<string, Entity>): Promise<void> {
    // Reset current participant's turn
    const currentParticipant = encounter.initiative[encounter.currentTurn];
    if (currentParticipant) {
      const entity = entities.get(currentParticipant.entityId);
      const combat = entity?.getComponent<CombatComponent>('Combat');
      if (combat) {
        combat.resetTurn();
      }
    }

    // Advance to next turn
    encounter.currentTurn++;
    if (encounter.currentTurn >= encounter.initiative.length) {
      encounter.currentTurn = 0;
      encounter.round++;
    }

    encounter.lastActionTime = Date.now();

    // Set up next participant's turn
    const nextParticipant = encounter.initiative[encounter.currentTurn];
    if (nextParticipant) {
      const entity = entities.get(nextParticipant.entityId);
      const movement = entity?.getComponent<MovementComponent>('Movement');
      if (movement) {
        movement.resetMovement();
      }
    }
  }

  // Check if combat should end
  private async checkCombatEnd(encounter: CombatEncounter, entities: Map<string, Entity>): Promise<boolean> {
    const aliveFactions = new Set<string>();

    for (const participant of encounter.participants) {
      const entity = entities.get(participant);
      const health = entity?.getComponent<HealthComponent>('Health');
      
      if (health?.isAlive()) {
        // Simple faction system - players vs NPCs
        const faction = entity?.type === 'PlayerCharacter' ? 'players' : 'enemies';
        aliveFactions.add(faction);
      }
    }

    return aliveFactions.size <= 1;
  }

  private async endCombat(encounter: CombatEncounter, entities: Map<string, Entity>): Promise<void> {
    encounter.status = 'ended';

    // Reset all participants
    for (const participant of encounter.participants) {
      const entity = entities.get(participant);
      const combat = entity?.getComponent<CombatComponent>('Combat');
      if (combat) {
        combat.exitCombat();
      }
    }

    this.activeCombats.delete(encounter.id);
  }

  // Check for new combat initiation
  private async checkCombatInitiation(entities: Map<string, Entity>): Promise<void> {
    // Simple proximity-based combat detection
    const combatRange = 30; // feet

    for (const [id1, entity1] of entities) {
      if (entity1.type !== 'PlayerCharacter' && entity1.type !== 'NPC') continue;
      
      const transform1 = entity1.getComponent<TransformComponent>('Transform');
      const combat1 = entity1.getComponent<CombatComponent>('Combat');
      
      if (!transform1 || !combat1 || combat1.inCombat) continue;

      for (const [id2, entity2] of entities) {
        if (id1 === id2 || entity2.type === entity1.type) continue;
        if (entity2.type !== 'PlayerCharacter' && entity2.type !== 'NPC') continue;

        const transform2 = entity2.getComponent<TransformComponent>('Transform');
        const combat2 = entity2.getComponent<CombatComponent>('Combat');
        
        if (!transform2 || !combat2 || combat2.inCombat) continue;

        const distance = this.calculateDistance(transform1.position, transform2.position);
        
        if (distance <= combatRange) {
          // Check if hostile (simplified)
          const entity1IsNPC = entity1.type === 'NPC';
          const entity2IsNPC = entity2.type === 'NPC';
          
          if (entity1IsNPC !== entity2IsNPC) { // Different types = hostile
            await this.initiateCombat([entity1, entity2]);
            return; // Only start one combat per update
          }
        }
      }
    }
  }

  // Start a new combat encounter
  private async initiateCombat(participants: Entity[]): Promise<string> {
    const combatId = uuidv4();
    
    // Roll initiative for all participants
    const initiative: { entityId: string; roll: number }[] = [];
    
    for (const participant of participants) {
      const stats = participant.getComponent<StatsComponent>('Stats');
      const combat = participant.getComponent<CombatComponent>('Combat');
      
      if (stats && combat) {
        const initiativeRoll = this.rollD20() + stats.getModifier('dexterity');
        initiative.push({ entityId: participant.id, roll: initiativeRoll });
        
        combat.enterCombat(combatId, initiativeRoll);
      }
    }

    // Sort by initiative (highest first)
    initiative.sort((a, b) => b.roll - a.roll);

    const encounter: CombatEncounter = {
      id: combatId,
      participants: participants.map(p => p.id),
      initiative,
      currentTurn: 0,
      round: 1,
      startTime: Date.now(),
      status: 'active',
      turnTimeLimit: 30000, // 30 seconds per turn
      lastActionTime: Date.now()
    };

    this.activeCombats.set(combatId, encounter);
    
    console.log(`Combat initiated: ${combatId} with ${participants.length} participants`);
    return combatId;
  }

  // Update AI combat behavior
  private async updateAICombat(entities: Map<string, Entity>): Promise<void> {
    for (const [id, entity] of entities) {
      const ai = entity.getComponent<AIComponent>('AI');
      const combat = entity.getComponent<CombatComponent>('Combat');
      
      if (!ai || !combat || !combat.inCombat) continue;

      // Check if it's this entity's turn
      const encounter = this.activeCombats.get(combat.combatId!);
      if (!encounter || encounter.initiative[encounter.currentTurn]?.entityId !== entity.id) {
        continue;
      }

      if (ai.canTakeAction() && combat.canTakeAction()) {
        await this.executeAIAction(entity, entities);
        ai.recordAction();
      }
    }
  }

  private async executeAIAction(entity: Entity, entities: Map<string, Entity>): Promise<void> {
    const ai = entity.getComponent<AIComponent>('AI');
    const transform = entity.getComponent<TransformComponent>('Transform');
    
    if (!ai || !transform) return;

    // Find nearest enemy
    const target = this.findNearestEnemy(entity, entities);
    if (!target) return;

    const targetTransform = target.getComponent<TransformComponent>('Transform');
    if (!targetTransform) return;

    const distance = this.calculateDistance(transform.position, targetTransform.position);

    // Simple AI decision making
    if (distance <= 5) { // Melee range
      const action: CombatAction = {
        id: uuidv4(),
        traceId: uuidv4(),
        actorId: entity.id,
        targetId: target.id,
        actionType: 'attack',
        timestamp: Date.now(),
        data: {}
      };
      
      this.queueAction(action);
    } else {
      // Move towards target
      const action: CombatAction = {
        id: uuidv4(),
        traceId: uuidv4(),
        actorId: entity.id,
        actionType: 'move',
        timestamp: Date.now(),
        data: { targetPosition: targetTransform.position }
      };
      
      this.queueAction(action);
    }
  }

  private findNearestEnemy(entity: Entity, entities: Map<string, Entity>): Entity | undefined {
    const transform = entity.getComponent<TransformComponent>('Transform');
    if (!transform) return undefined;

    let nearestEnemy: Entity | undefined;
    let nearestDistance = Infinity;

    for (const [id, other] of entities) {
      if (id === entity.id) continue;
      
      // Check if hostile (simplified: different types are hostile)
      if (entity.type === other.type) continue;
      
      const otherTransform = other.getComponent<TransformComponent>('Transform');
      const otherHealth = other.getComponent<HealthComponent>('Health');
      
      if (!otherTransform || !otherHealth || !otherHealth.isAlive()) continue;

      const distance = this.calculateDistance(transform.position, otherTransform.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEnemy = other;
      }
    }

    return nearestEnemy;
  }

  private async handleDeath(entity: Entity, entities: Map<string, Entity>): Promise<void> {
    const combat = entity.getComponent<CombatComponent>('Combat');
    if (combat?.inCombat) {
      // Remove from combat
      const encounter = this.activeCombats.get(combat.combatId!);
      if (encounter) {
        encounter.participants = encounter.participants.filter(id => id !== entity.id);
        encounter.initiative = encounter.initiative.filter(init => init.entityId !== entity.id);
        
        // Adjust current turn if necessary
        if (encounter.currentTurn >= encounter.initiative.length) {
          encounter.currentTurn = 0;
        }
      }
    }

    // Mark entity as inactive
    entity.active = false;
  }

  // Queue an action for processing
  public queueAction(action: CombatAction): void {
    this.actionQueue.push(action);
  }

  // Utility methods
  private rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
  }

  private rollDice(count: number, sides: number): number {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  }

  private calculateDistance(pos1: {x: number, y: number, z: number}, pos2: {x: number, y: number, z: number}): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Get active combat encounters (for API/Unity)
  public getActiveCombats(): CombatEncounter[] {
    return Array.from(this.activeCombats.values());
  }

  public getCombat(combatId: string): CombatEncounter | undefined {
    return this.activeCombats.get(combatId);
  }

  // Force end combat (admin function)
  public async forceCombatEnd(combatId: string, entities: Map<string, Entity>): Promise<boolean> {
    const encounter = this.activeCombats.get(combatId);
    if (encounter) {
      await this.endCombat(encounter, entities);
      return true;
    }
    return false;
  }
}