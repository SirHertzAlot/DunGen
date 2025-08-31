import { Entity } from '../entities/Entity';

// Base interface for all ECS systems
export interface ISystem {
  readonly systemType: string;
  
  // Main update loop called every frame
  update(entities: Map<string, Entity>, deltaTime: number): Promise<void>;
  
  // Initialize system (called once at startup)
  initialize?(): Promise<void>;
  
  // Cleanup system (called at shutdown)
  cleanup?(): Promise<void>;
  
  // Enable/disable system
  enabled?: boolean;
}