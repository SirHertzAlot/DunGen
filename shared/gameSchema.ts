import { z } from 'zod';
// Note: Using Zod schemas directly for ECS components
// Will integrate with Drizzle for persistence later

// D&D-based character classes and races
export const CharacterClass = z.enum([
  'fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'paladin',
  'barbarian', 'bard', 'druid', 'monk', 'sorcerer', 'warlock'
]);

export const CharacterRace = z.enum([
  'human', 'elf', 'dwarf', 'halfling', 'dragonborn', 'gnome',
  'half_elf', 'half_orc', 'tiefling', 'aasimar', 'genasi'
]);

export const DamageType = z.enum([
  'slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning',
  'thunder', 'poison', 'acid', 'necrotic', 'radiant', 'psychic', 'force'
]);

export const SpellSchool = z.enum([
  'abjuration', 'conjuration', 'divination', 'enchantment',
  'evocation', 'illusion', 'necromancy', 'transmutation'
]);

// Core ability scores (D&D standard)
export const AbilityScoresSchema = z.object({
  strength: z.number().min(1).max(30).default(10),
  dexterity: z.number().min(1).max(30).default(10),
  constitution: z.number().min(1).max(30).default(10),
  intelligence: z.number().min(1).max(30).default(10),
  wisdom: z.number().min(1).max(30).default(10),
  charisma: z.number().min(1).max(30).default(10)
});

// Combat stats for fast live action
export const CombatStatsSchema = z.object({
  hitPoints: z.number().min(0),
  maxHitPoints: z.number().min(1),
  armorClass: z.number().min(10).max(30),
  speed: z.number().min(0).default(30),
  initiative: z.number().default(0),
  proficiencyBonus: z.number().min(2).default(2),
  attacksPerRound: z.number().min(1).default(1),
  
  // Saving throws
  savingThrows: z.object({
    strength: z.number().default(0),
    dexterity: z.number().default(0),
    constitution: z.number().default(0),
    intelligence: z.number().default(0),
    wisdom: z.number().default(0),
    charisma: z.number().default(0)
  }),
  
  // Damage resistances/immunities
  resistances: z.array(DamageType).default([]),
  immunities: z.array(DamageType).default([]),
  vulnerabilities: z.array(DamageType).default([])
});

// Skills system (D&D 5e)
export const SkillsSchema = z.object({
  acrobatics: z.number().default(0),
  animalHandling: z.number().default(0),
  arcana: z.number().default(0),
  athletics: z.number().default(0),
  deception: z.number().default(0),
  history: z.number().default(0),
  insight: z.number().default(0),
  intimidation: z.number().default(0),
  investigation: z.number().default(0),
  medicine: z.number().default(0),
  nature: z.number().default(0),
  perception: z.number().default(0),
  performance: z.number().default(0),
  persuasion: z.number().default(0),
  religion: z.number().default(0),
  sleightOfHand: z.number().default(0),
  stealth: z.number().default(0),
  survival: z.number().default(0)
});

// Equipment and inventory
export const ItemRarity = z.enum(['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact']);
export const ItemType = z.enum(['weapon', 'armor', 'shield', 'tool', 'consumable', 'misc', 'spell_component']);

export const ItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  itemType: ItemType,
  rarity: ItemRarity,
  value: z.number().min(0).default(0), // in copper pieces
  weight: z.number().min(0).default(0),
  stackable: z.boolean().default(false),
  maxStack: z.number().min(1).default(1),
  
  // Weapon properties
  weaponData: z.object({
    damage: z.string().optional(), // e.g., "1d8"
    damageType: DamageType.optional(),
    properties: z.array(z.string()).default([]), // versatile, finesse, etc.
    attackBonus: z.number().default(0),
    range: z.number().optional() // for ranged weapons
  }).optional(),
  
  // Armor properties
  armorData: z.object({
    armorClass: z.number().min(10).max(20),
    armorType: z.enum(['light', 'medium', 'heavy', 'shield']),
    stealthDisadvantage: z.boolean().default(false),
    strengthRequirement: z.number().optional()
  }).optional(),
  
  // Consumable properties
  consumableData: z.object({
    effect: z.string(),
    duration: z.number().default(0), // in seconds
    charges: z.number().default(1)
  }).optional()
});

// Spells system
export const SpellSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  level: z.number().min(0).max(9), // 0 = cantrip
  school: SpellSchool,
  castingTime: z.string(), // "1 action", "1 bonus action", etc.
  range: z.string(), // "30 feet", "Touch", "Self", etc.
  components: z.object({
    verbal: z.boolean().default(false),
    somatic: z.boolean().default(false),
    material: z.boolean().default(false),
    materialComponent: z.string().optional()
  }),
  duration: z.string(), // "Instantaneous", "1 minute", "Concentration, up to 1 hour"
  description: z.string(),
  damage: z.string().optional(), // e.g., "3d6"
  damageType: DamageType.optional(),
  savingThrow: z.enum(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']).optional(),
  attackRoll: z.boolean().default(false),
  ritual: z.boolean().default(false)
});

// Character progression
export const CharacterProgressionSchema = z.object({
  level: z.number().min(1).max(20).default(1),
  experience: z.number().min(0).default(0),
  experienceToNext: z.number().min(0).default(300),
  
  // Class features unlocked
  classFeatures: z.array(z.string()).default([]),
  spellSlots: z.object({
    level1: z.number().min(0).default(0),
    level2: z.number().min(0).default(0),
    level3: z.number().min(0).default(0),
    level4: z.number().min(0).default(0),
    level5: z.number().min(0).default(0),
    level6: z.number().min(0).default(0),
    level7: z.number().min(0).default(0),
    level8: z.number().min(0).default(0),
    level9: z.number().min(0).default(0)
  }).default({}),
  
  // Known spells and prepared spells
  knownSpells: z.array(z.string().uuid()).default([]),
  preparedSpells: z.array(z.string().uuid()).default([])
});

// Live action combat state
export const CombatStateSchema = z.object({
  isInCombat: z.boolean().default(false),
  combatId: z.string().uuid().optional(),
  initiative: z.number().default(0),
  currentTurn: z.boolean().default(false),
  actionsUsed: z.number().default(0),
  bonusActionUsed: z.boolean().default(false),
  reactionUsed: z.boolean().default(false),
  movementUsed: z.number().default(0),
  
  // Temporary effects
  conditions: z.array(z.string()).default([]), // poisoned, charmed, etc.
  temporaryHitPoints: z.number().default(0),
  activeEffects: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    duration: z.number(), // remaining seconds
    effect: z.any()
  })).default([])
});

// Enhanced character schema with D&D systems
export const GameCharacterSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid(),
  name: z.string(),
  
  // D&D character basics
  characterClass: CharacterClass,
  race: CharacterRace,
  background: z.string().default('folk_hero'),
  alignment: z.string().default('neutral'),
  
  // Core stats
  abilityScores: AbilityScoresSchema,
  combatStats: CombatStatsSchema,
  skills: SkillsSchema,
  progression: CharacterProgressionSchema,
  combatState: CombatStateSchema,
  
  // Granular positioning
  worldId: z.string().uuid(),
  regionId: z.string().uuid(),
  blockId: z.string().uuid(),
  cellId: z.string().uuid(),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number().optional(),
  facing: z.number().min(0).max(360).default(0), // for combat positioning
  
  // Inventory and equipment
  inventory: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: z.number().min(1).default(1),
    equipped: z.boolean().default(false),
    slot: z.string().optional() // mainhand, offhand, armor, etc.
  })).default([]),
  
  // Currency (D&D standard)
  currency: z.object({
    copper: z.number().min(0).default(0),
    silver: z.number().min(0).default(0),
    gold: z.number().min(0).default(0),
    platinum: z.number().min(0).default(0)
  }).default({}),
  
  createdAt: z.date(),
  updatedAt: z.date()
});

// Combat encounter system
export const CombatEncounterSchema = z.object({
  id: z.string().uuid(),
  worldId: z.string().uuid(),
  regionId: z.string().uuid(),
  blockId: z.string().uuid(),
  cellId: z.string().uuid(),
  
  participants: z.array(z.object({
    characterId: z.string().uuid(),
    initiative: z.number(),
    position: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number().optional()
    }),
    isNPC: z.boolean().default(false)
  })),
  
  currentRound: z.number().min(1).default(1),
  currentTurnIndex: z.number().min(0).default(0),
  turnTimeLimit: z.number().default(30), // seconds per turn
  turnStartTime: z.date().optional(),
  
  status: z.enum(['starting', 'active', 'paused', 'ended']).default('starting'),
  
  // Combat grid for tactical positioning
  battleGrid: z.object({
    width: z.number().min(1).default(20),
    height: z.number().min(1).default(20),
    cellSize: z.number().default(5) // 5 feet per cell (D&D standard)
  }),
  
  createdAt: z.date(),
  updatedAt: z.date()
});

// NPC/Monster schema
export const NPCSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(['humanoid', 'beast', 'monstrosity', 'undead', 'fiend', 'celestial', 'elemental', 'fey', 'dragon', 'giant', 'aberration', 'construct', 'ooze', 'plant']),
  challengeRating: z.number().min(0).max(30),
  
  // Core stats (same as player characters)
  abilityScores: AbilityScoresSchema,
  combatStats: CombatStatsSchema,
  skills: SkillsSchema,
  
  // AI behavior
  behavior: z.object({
    aggression: z.number().min(0).max(10).default(5),
    intelligence: z.number().min(0).max(10).default(5),
    fleeThreshold: z.number().min(0).max(100).default(25), // % HP to flee
    preferredRange: z.enum(['melee', 'ranged', 'mixed']).default('melee'),
    spellcaster: z.boolean().default(false)
  }),
  
  // Positioning
  worldId: z.string().uuid(),
  regionId: z.string().uuid(),
  blockId: z.string().uuid(),
  cellId: z.string().uuid(),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number().optional(),
  
  // Loot table
  lootTable: z.array(z.object({
    itemId: z.string().uuid(),
    dropChance: z.number().min(0).max(100),
    quantity: z.object({
      min: z.number().min(1).default(1),
      max: z.number().min(1).default(1)
    })
  })).default([]),
  
  isAlive: z.boolean().default(true),
  respawnTime: z.number().optional(), // seconds until respawn
  
  createdAt: z.date(),
  updatedAt: z.date()
});

// Combat action types for fast combat
export const CombatActionSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string().uuid(), // for debugging
  combatId: z.string().uuid(),
  actorId: z.string().uuid(), // character or NPC
  
  actionType: z.enum([
    'attack', 'spell', 'move', 'dash', 'dodge', 'help', 'hide', 'ready', 'search', 'use_item'
  ]),
  
  targetId: z.string().uuid().optional(),
  targetPosition: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional()
  }).optional(),
  
  // Attack details
  attackData: z.object({
    weaponId: z.string().uuid().optional(),
    attackRoll: z.number(),
    damage: z.number(),
    damageType: DamageType,
    critical: z.boolean().default(false)
  }).optional(),
  
  // Spell details
  spellData: z.object({
    spellId: z.string().uuid(),
    spellLevel: z.number().min(0).max(9),
    saveDC: z.number().optional(),
    damage: z.number().optional(),
    healing: z.number().optional()
  }).optional(),
  
  // Movement details
  movementData: z.object({
    fromPosition: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }),
    toPosition: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }),
    distance: z.number(),
    remainingMovement: z.number()
  }).optional(),
  
  result: z.object({
    success: z.boolean(),
    damage: z.number().default(0),
    healing: z.number().default(0),
    effects: z.array(z.string()).default([]),
    message: z.string()
  }),
  
  timestamp: z.date(),
  processingTime: z.number() // milliseconds for performance tracking
});

// Types for TypeScript
export type GameCharacter = z.infer<typeof GameCharacterSchema>;
export type CombatEncounter = z.infer<typeof CombatEncounterSchema>;
export type NPC = z.infer<typeof NPCSchema>;
export type CombatAction = z.infer<typeof CombatActionSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Spell = z.infer<typeof SpellSchema>;
export type AbilityScores = z.infer<typeof AbilityScoresSchema>;
export type CombatStats = z.infer<typeof CombatStatsSchema>;
export type Skills = z.infer<typeof SkillsSchema>;

// Insert schemas - simplified for ECS architecture
export type InsertGameCharacter = Omit<GameCharacter, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertCombatEncounter = Omit<CombatEncounter, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertNPC = Omit<NPC, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertCombatAction = Omit<CombatAction, 'id' | 'timestamp' | 'processingTime'>;
export type InsertItem = Omit<Item, 'id'>;
export type InsertSpell = Omit<Spell, 'id'>;