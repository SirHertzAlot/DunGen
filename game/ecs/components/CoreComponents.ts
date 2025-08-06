import { v4 as uuidv4 } from 'uuid';

// Base ECS Component interface
export interface IComponent {
  readonly entityId: string;
  readonly componentType: string;
  readonly id: string;
  enabled: boolean;
  dirty: boolean; // for Unity sync
}

// Base component class
export abstract class Component implements IComponent {
  public readonly id: string;
  public readonly componentType: string;
  public enabled: boolean = true;
  public dirty: boolean = true;

  constructor(
    public readonly entityId: string,
    componentType: string
  ) {
    this.id = uuidv4();
    this.componentType = componentType;
  }

  // Serialize for Unity communication
  abstract serialize(): any;
  
  // Deserialize from Unity
  abstract deserialize(data: any): void;
  
  // Mark as dirty for sync
  markDirty(): void {
    this.dirty = true;
  }
}

// Transform Component - Core positioning
export class TransformComponent extends Component {
  constructor(
    entityId: string,
    public position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    public rotation: { x: number; y: number; z: number; w: number } = { x: 0, y: 0, z: 0, w: 1 },
    public scale: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 }
  ) {
    super(entityId, 'Transform');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      position: this.position,
      rotation: this.rotation,
      scale: this.scale,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.position = data.position || this.position;
    this.rotation = data.rotation || this.rotation;
    this.scale = data.scale || this.scale;
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  setPosition(x: number, y: number, z: number) {
    this.position = { x, y, z };
    this.markDirty();
  }

  setRotation(x: number, y: number, z: number, w: number) {
    this.rotation = { x, y, z, w };
    this.markDirty();
  }
}

// D&D Stats Component
export class StatsComponent extends Component {
  constructor(
    entityId: string,
    public abilityScores: {
      strength: number;
      dexterity: number;
      constitution: number;
      intelligence: number;
      wisdom: number;
      charisma: number;
    } = {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10
    }
  ) {
    super(entityId, 'Stats');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      abilityScores: this.abilityScores,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.abilityScores = { ...this.abilityScores, ...data.abilityScores };
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  getModifier(ability: keyof typeof this.abilityScores): number {
    return Math.floor((this.abilityScores[ability] - 10) / 2);
  }

  updateAbilityScore(ability: keyof typeof this.abilityScores, value: number) {
    this.abilityScores[ability] = Math.max(1, Math.min(30, value));
    this.markDirty();
  }
}

// Health Component for live combat
export class HealthComponent extends Component {
  constructor(
    entityId: string,
    public currentHP: number = 100,
    public maxHP: number = 100,
    public temporaryHP: number = 0,
    public armorClass: number = 10
  ) {
    super(entityId, 'Health');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      currentHP: this.currentHP,
      maxHP: this.maxHP,
      temporaryHP: this.temporaryHP,
      armorClass: this.armorClass,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.currentHP = data.currentHP ?? this.currentHP;
    this.maxHP = data.maxHP ?? this.maxHP;
    this.temporaryHP = data.temporaryHP ?? this.temporaryHP;
    this.armorClass = data.armorClass ?? this.armorClass;
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  takeDamage(damage: number): number {
    const totalHP = this.temporaryHP + this.currentHP;
    const actualDamage = Math.min(damage, totalHP);
    
    if (this.temporaryHP > 0) {
      const tempDamage = Math.min(damage, this.temporaryHP);
      this.temporaryHP -= tempDamage;
      damage -= tempDamage;
    }
    
    if (damage > 0) {
      this.currentHP = Math.max(0, this.currentHP - damage);
    }
    
    this.markDirty();
    return actualDamage;
  }

  heal(amount: number): number {
    const oldHP = this.currentHP;
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
    const actualHealing = this.currentHP - oldHP;
    this.markDirty();
    return actualHealing;
  }

  isAlive(): boolean {
    return this.currentHP > 0;
  }

  isDying(): boolean {
    return this.currentHP === 0;
  }
}

// Movement Component for real-time movement
export class MovementComponent extends Component {
  constructor(
    entityId: string,
    public speed: number = 30, // feet per round in D&D
    public currentMovement: number = 30,
    public isMoving: boolean = false,
    public targetPosition?: { x: number; y: number; z: number }
  ) {
    super(entityId, 'Movement');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      speed: this.speed,
      currentMovement: this.currentMovement,
      isMoving: this.isMoving,
      targetPosition: this.targetPosition,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.speed = data.speed ?? this.speed;
    this.currentMovement = data.currentMovement ?? this.currentMovement;
    this.isMoving = data.isMoving ?? this.isMoving;
    this.targetPosition = data.targetPosition ?? this.targetPosition;
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  setTarget(x: number, y: number, z: number) {
    this.targetPosition = { x, y, z };
    this.isMoving = true;
    this.markDirty();
  }

  resetMovement() {
    this.currentMovement = this.speed;
    this.isMoving = false;
    this.targetPosition = undefined;
    this.markDirty();
  }

  useMovement(distance: number): boolean {
    if (distance <= this.currentMovement) {
      this.currentMovement -= distance;
      this.markDirty();
      return true;
    }
    return false;
  }
}

// Combat Component for fast action combat
export class CombatComponent extends Component {
  constructor(
    entityId: string,
    public initiative: number = 0,
    public actionsUsed: number = 0,
    public maxActions: number = 1,
    public bonusActionUsed: boolean = false,
    public reactionUsed: boolean = false,
    public attacksOfOpportunity: number = 0,
    public inCombat: boolean = false,
    public combatId?: string
  ) {
    super(entityId, 'Combat');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      initiative: this.initiative,
      actionsUsed: this.actionsUsed,
      maxActions: this.maxActions,
      bonusActionUsed: this.bonusActionUsed,
      reactionUsed: this.reactionUsed,
      attacksOfOpportunity: this.attacksOfOpportunity,
      inCombat: this.inCombat,
      combatId: this.combatId,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.initiative = data.initiative ?? this.initiative;
    this.actionsUsed = data.actionsUsed ?? this.actionsUsed;
    this.maxActions = data.maxActions ?? this.maxActions;
    this.bonusActionUsed = data.bonusActionUsed ?? this.bonusActionUsed;
    this.reactionUsed = data.reactionUsed ?? this.reactionUsed;
    this.attacksOfOpportunity = data.attacksOfOpportunity ?? this.attacksOfOpportunity;
    this.inCombat = data.inCombat ?? this.inCombat;
    this.combatId = data.combatId ?? this.combatId;
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  canTakeAction(): boolean {
    return this.actionsUsed < this.maxActions;
  }

  canTakeBonusAction(): boolean {
    return !this.bonusActionUsed;
  }

  canTakeReaction(): boolean {
    return !this.reactionUsed;
  }

  useAction(): boolean {
    if (this.canTakeAction()) {
      this.actionsUsed++;
      this.markDirty();
      return true;
    }
    return false;
  }

  useBonusAction(): boolean {
    if (this.canTakeBonusAction()) {
      this.bonusActionUsed = true;
      this.markDirty();
      return true;
    }
    return false;
  }

  useReaction(): boolean {
    if (this.canTakeReaction()) {
      this.reactionUsed = true;
      this.markDirty();
      return true;
    }
    return false;
  }

  resetTurn() {
    this.actionsUsed = 0;
    this.bonusActionUsed = false;
    this.reactionUsed = false;
    this.markDirty();
  }

  enterCombat(combatId: string, initiative: number) {
    this.inCombat = true;
    this.combatId = combatId;
    this.initiative = initiative;
    this.resetTurn();
  }

  exitCombat() {
    this.inCombat = false;
    this.combatId = undefined;
    this.resetTurn();
  }
}

// Equipment Component for D&D gear system
export class EquipmentComponent extends Component {
  constructor(
    entityId: string,
    public mainHand?: string, // item ID
    public offHand?: string,
    public armor?: string,
    public shield?: string,
    public accessories: string[] = [],
    public encumbrance: number = 0,
    public maxEncumbrance: number = 150 // based on strength
  ) {
    super(entityId, 'Equipment');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      mainHand: this.mainHand,
      offHand: this.offHand,
      armor: this.armor,
      shield: this.shield,
      accessories: this.accessories,
      encumbrance: this.encumbrance,
      maxEncumbrance: this.maxEncumbrance,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.mainHand = data.mainHand ?? this.mainHand;
    this.offHand = data.offHand ?? this.offHand;
    this.armor = data.armor ?? this.armor;
    this.shield = data.shield ?? this.shield;
    this.accessories = data.accessories ?? this.accessories;
    this.encumbrance = data.encumbrance ?? this.encumbrance;
    this.maxEncumbrance = data.maxEncumbrance ?? this.maxEncumbrance;
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  equipItem(slot: 'mainHand' | 'offHand' | 'armor' | 'shield', itemId: string): boolean {
    if (this[slot] !== undefined) {
      return false; // slot occupied
    }
    
    this[slot] = itemId;
    this.markDirty();
    return true;
  }

  unequipItem(slot: 'mainHand' | 'offHand' | 'armor' | 'shield'): string | undefined {
    const itemId = this[slot];
    this[slot] = undefined;
    this.markDirty();
    return itemId;
  }

  isOverencumbered(): boolean {
    return this.encumbrance > this.maxEncumbrance;
  }
}

// Spellcasting Component for D&D magic system
export class SpellcastingComponent extends Component {
  constructor(
    entityId: string,
    public spellSlots: { [level: number]: { current: number; max: number } } = {},
    public knownSpells: string[] = [],
    public preparedSpells: string[] = [],
    public spellAttackBonus: number = 0,
    public spellSaveDC: number = 8,
    public spellcastingAbility: 'intelligence' | 'wisdom' | 'charisma' = 'intelligence',
    public canCastRituals: boolean = false
  ) {
    super(entityId, 'Spellcasting');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      spellSlots: this.spellSlots,
      knownSpells: this.knownSpells,
      preparedSpells: this.preparedSpells,
      spellAttackBonus: this.spellAttackBonus,
      spellSaveDC: this.spellSaveDC,
      spellcastingAbility: this.spellcastingAbility,
      canCastRituals: this.canCastRituals,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.spellSlots = data.spellSlots ?? this.spellSlots;
    this.knownSpells = data.knownSpells ?? this.knownSpells;
    this.preparedSpells = data.preparedSpells ?? this.preparedSpells;
    this.spellAttackBonus = data.spellAttackBonus ?? this.spellAttackBonus;
    this.spellSaveDC = data.spellSaveDC ?? this.spellSaveDC;
    this.spellcastingAbility = data.spellcastingAbility ?? this.spellcastingAbility;
    this.canCastRituals = data.canCastRituals ?? this.canCastRituals;
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  canCastSpell(spellLevel: number): boolean {
    // Check for available spell slots of this level or higher
    for (let level = spellLevel; level <= 9; level++) {
      const slots = this.spellSlots[level];
      if (slots && slots.current > 0) {
        return true;
      }
    }
    return false;
  }

  castSpell(spellLevel: number, usingSlotLevel?: number): boolean {
    const actualLevel = usingSlotLevel || spellLevel;
    const slots = this.spellSlots[actualLevel];
    
    if (slots && slots.current > 0) {
      slots.current--;
      this.markDirty();
      return true;
    }
    return false;
  }

  restoreSpellSlots() {
    for (const level in this.spellSlots) {
      this.spellSlots[level].current = this.spellSlots[level].max;
    }
    this.markDirty();
  }

  addKnownSpell(spellId: string): boolean {
    if (!this.knownSpells.includes(spellId)) {
      this.knownSpells.push(spellId);
      this.markDirty();
      return true;
    }
    return false;
  }

  prepareSpell(spellId: string): boolean {
    if (this.knownSpells.includes(spellId) && !this.preparedSpells.includes(spellId)) {
      this.preparedSpells.push(spellId);
      this.markDirty();
      return true;
    }
    return false;
  }
}

// AI Component for NPCs and monsters
export class AIComponent extends Component {
  constructor(
    entityId: string,
    public aiType: 'passive' | 'aggressive' | 'defensive' | 'tactical' = 'passive',
    public aggroRange: number = 10,
    public fleeThreshold: number = 25, // % health
    public targetId?: string,
    public lastAction: number = 0,
    public actionCooldown: number = 1000, // milliseconds
    public behavior: {
      preferredRange: 'melee' | 'ranged' | 'mixed';
      intelligence: number; // 1-10
      aggression: number; // 1-10
      teamwork: number; // 1-10
    } = {
      preferredRange: 'melee',
      intelligence: 5,
      aggression: 5,
      teamwork: 5
    }
  ) {
    super(entityId, 'AI');
  }

  serialize() {
    return {
      entityId: this.entityId,
      componentType: this.componentType,
      aiType: this.aiType,
      aggroRange: this.aggroRange,
      fleeThreshold: this.fleeThreshold,
      targetId: this.targetId,
      lastAction: this.lastAction,
      actionCooldown: this.actionCooldown,
      behavior: this.behavior,
      enabled: this.enabled
    };
  }

  deserialize(data: any) {
    this.aiType = data.aiType ?? this.aiType;
    this.aggroRange = data.aggroRange ?? this.aggroRange;
    this.fleeThreshold = data.fleeThreshold ?? this.fleeThreshold;
    this.targetId = data.targetId ?? this.targetId;
    this.lastAction = data.lastAction ?? this.lastAction;
    this.actionCooldown = data.actionCooldown ?? this.actionCooldown;
    this.behavior = { ...this.behavior, ...data.behavior };
    this.enabled = data.enabled ?? this.enabled;
    this.dirty = false;
  }

  setTarget(targetId: string) {
    this.targetId = targetId;
    this.markDirty();
  }

  clearTarget() {
    this.targetId = undefined;
    this.markDirty();
  }

  canTakeAction(): boolean {
    return Date.now() - this.lastAction >= this.actionCooldown;
  }

  recordAction() {
    this.lastAction = Date.now();
    this.markDirty();
  }
}