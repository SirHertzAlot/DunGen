import { v4 as uuidv4 } from 'uuid';
import { IComponent, Component } from '../components/CoreComponents';

// Entity interface
export interface IEntity {
  readonly id: string;
  readonly type: string;
  active: boolean;
  components: Map<string, IComponent>;
  
  addComponent<T extends IComponent>(component: T): void;
  removeComponent(componentType: string): boolean;
  getComponent<T extends IComponent>(componentType: string): T | undefined;
  hasComponent(componentType: string): boolean;
  getAllComponents(): IComponent[];
  serialize(): any;
  deserialize(data: any): void;
}

// Base Entity class for Unity ECS integration
export class Entity implements IEntity {
  public readonly id: string;
  public readonly type: string;
  public active: boolean = true;
  public components: Map<string, IComponent> = new Map();
  public dirty: boolean = true; // for Unity sync
  public lastUpdate: number = Date.now();

  constructor(type: string, id?: string) {
    this.id = id || uuidv4();
    this.type = type;
  }

  addComponent<T extends IComponent>(component: T): void {
    this.components.set(component.componentType, component);
    this.markDirty();
  }

  removeComponent(componentType: string): boolean {
    const removed = this.components.delete(componentType);
    if (removed) {
      this.markDirty();
    }
    return removed;
  }

  getComponent<T extends IComponent>(componentType: string): T | undefined {
    return this.components.get(componentType) as T;
  }

  hasComponent(componentType: string): boolean {
    return this.components.has(componentType);
  }

  getAllComponents(): IComponent[] {
    return Array.from(this.components.values());
  }

  // Check if entity needs sync with Unity
  isDirty(): boolean {
    return this.dirty || Array.from(this.components.values()).some(c => c.dirty);
  }

  markDirty(): void {
    this.dirty = true;
    this.lastUpdate = Date.now();
  }

  markClean(): void {
    this.dirty = false;
    this.components.forEach(c => c.dirty = false);
  }

  // Serialize for Unity communication
  serialize(): any {
    const componentData: any = {};
    this.components.forEach((component, type) => {
      if ('serialize' in component && typeof component.serialize === 'function') {
        componentData[type] = component.serialize();
      }
    });

    return {
      id: this.id,
      type: this.type,
      active: this.active,
      components: componentData,
      lastUpdate: this.lastUpdate
    };
  }

  // Deserialize from Unity
  deserialize(data: any): void {
    this.active = data.active ?? this.active;
    
    if (data.components) {
      Object.entries(data.components).forEach(([type, componentData]) => {
        const component = this.getComponent(type);
        if (component && 'deserialize' in component && typeof component.deserialize === 'function') {
          component.deserialize(componentData);
        }
      });
    }

    this.lastUpdate = data.lastUpdate || this.lastUpdate;
    this.dirty = false;
  }

  // Destroy entity and cleanup
  destroy(): void {
    this.active = false;
    this.components.clear();
    this.markDirty();
  }
}

// Specialized entity types for D&D MMORPG
export class PlayerCharacterEntity extends Entity {
  constructor(
    id?: string,
    public playerId?: string,
    public characterName?: string
  ) {
    super('PlayerCharacter', id);
  }

  serialize(): any {
    return {
      ...super.serialize(),
      playerId: this.playerId,
      characterName: this.characterName
    };
  }

  deserialize(data: any): void {
    super.deserialize(data);
    this.playerId = data.playerId ?? this.playerId;
    this.characterName = data.characterName ?? this.characterName;
  }
}

export class NPCEntity extends Entity {
  constructor(
    id?: string,
    public npcType: string = 'humanoid',
    public challengeRating: number = 1,
    public faction?: string
  ) {
    super('NPC', id);
  }

  serialize(): any {
    return {
      ...super.serialize(),
      npcType: this.npcType,
      challengeRating: this.challengeRating,
      faction: this.faction
    };
  }

  deserialize(data: any): void {
    super.deserialize(data);
    this.npcType = data.npcType ?? this.npcType;
    this.challengeRating = data.challengeRating ?? this.challengeRating;
    this.faction = data.faction ?? this.faction;
  }
}

export class ProjectileEntity extends Entity {
  constructor(
    id?: string,
    public shooterId?: string,
    public targetId?: string,
    public damageAmount: number = 0,
    public damageType: string = 'piercing'
  ) {
    super('Projectile', id);
  }

  serialize(): any {
    return {
      ...super.serialize(),
      shooterId: this.shooterId,
      targetId: this.targetId,
      damageAmount: this.damageAmount,
      damageType: this.damageType
    };
  }

  deserialize(data: any): void {
    super.deserialize(data);
    this.shooterId = data.shooterId ?? this.shooterId;
    this.targetId = data.targetId ?? this.targetId;
    this.damageAmount = data.damageAmount ?? this.damageAmount;
    this.damageType = data.damageType ?? this.damageType;
  }
}

export class SpellEffectEntity extends Entity {
  constructor(
    id?: string,
    public casterId?: string,
    public spellId?: string,
    public duration: number = 0,
    public remainingDuration: number = 0
  ) {
    super('SpellEffect', id);
    this.remainingDuration = duration;
  }

  serialize(): any {
    return {
      ...super.serialize(),
      casterId: this.casterId,
      spellId: this.spellId,
      duration: this.duration,
      remainingDuration: this.remainingDuration
    };
  }

  deserialize(data: any): void {
    super.deserialize(data);
    this.casterId = data.casterId ?? this.casterId;
    this.spellId = data.spellId ?? this.spellId;
    this.duration = data.duration ?? this.duration;
    this.remainingDuration = data.remainingDuration ?? this.remainingDuration;
  }

  tick(deltaTime: number): boolean {
    this.remainingDuration -= deltaTime;
    this.markDirty();
    return this.remainingDuration <= 0;
  }
}

export class EnvironmentalEntity extends Entity {
  constructor(
    id?: string,
    public interactable: boolean = false,
    public triggerType?: 'proximity' | 'interact' | 'combat',
    public triggerRadius: number = 1
  ) {
    super('Environmental', id);
  }

  serialize(): any {
    return {
      ...super.serialize(),
      interactable: this.interactable,
      triggerType: this.triggerType,
      triggerRadius: this.triggerRadius
    };
  }

  deserialize(data: any): void {
    super.deserialize(data);
    this.interactable = data.interactable ?? this.interactable;
    this.triggerType = data.triggerType ?? this.triggerType;
    this.triggerRadius = data.triggerRadius ?? this.triggerRadius;
  }
}

// Entity factory for creating different types
export class EntityFactory {
  static createPlayerCharacter(
    playerId: string,
    characterName: string,
    position: { x: number; y: number; z: number }
  ): PlayerCharacterEntity {
    const entity = new PlayerCharacterEntity(undefined, playerId, characterName);
    
    // Add default components
    const {
      TransformComponent,
      StatsComponent,
      HealthComponent,
      MovementComponent,
      CombatComponent,
      EquipmentComponent
    } = require('../components/CoreComponents');

    entity.addComponent(new TransformComponent(entity.id, position));
    entity.addComponent(new StatsComponent(entity.id));
    entity.addComponent(new HealthComponent(entity.id));
    entity.addComponent(new MovementComponent(entity.id));
    entity.addComponent(new CombatComponent(entity.id));
    entity.addComponent(new EquipmentComponent(entity.id));

    return entity;
  }

  static createNPC(
    npcType: string,
    challengeRating: number,
    position: { x: number; y: number; z: number }
  ): NPCEntity {
    const entity = new NPCEntity(undefined, npcType, challengeRating);
    
    const {
      TransformComponent,
      StatsComponent,
      HealthComponent,
      MovementComponent,
      CombatComponent,
      AIComponent
    } = require('../components/CoreComponents');

    entity.addComponent(new TransformComponent(entity.id, position));
    entity.addComponent(new StatsComponent(entity.id));
    entity.addComponent(new HealthComponent(entity.id, 100, 100, 0, 12 + challengeRating));
    entity.addComponent(new MovementComponent(entity.id));
    entity.addComponent(new CombatComponent(entity.id));
    entity.addComponent(new AIComponent(entity.id));

    return entity;
  }

  static createProjectile(
    shooterId: string,
    startPos: { x: number; y: number; z: number },
    targetPos: { x: number; y: number; z: number },
    damage: number,
    damageType: string = 'piercing'
  ): ProjectileEntity {
    const entity = new ProjectileEntity(undefined, shooterId, undefined, damage, damageType);
    
    const { TransformComponent, MovementComponent } = require('../components/CoreComponents');

    entity.addComponent(new TransformComponent(entity.id, startPos));
    const movement = new MovementComponent(entity.id, 60); // Fast projectile
    movement.setTarget(targetPos.x, targetPos.y, targetPos.z);
    entity.addComponent(movement);

    return entity;
  }

  static createSpellEffect(
    casterId: string,
    spellId: string,
    position: { x: number; y: number; z: number },
    duration: number
  ): SpellEffectEntity {
    const entity = new SpellEffectEntity(undefined, casterId, spellId, duration, duration);
    
    const { TransformComponent } = require('../components/CoreComponents');
    entity.addComponent(new TransformComponent(entity.id, position));

    return entity;
  }
}