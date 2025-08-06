import { ISystem } from './ISystem';
import { Entity } from '../entities/Entity';
import { TransformComponent, MovementComponent, CombatComponent } from '../components/CoreComponents';

// High-performance movement system for real-time gameplay
export class MovementSystem implements ISystem {
  public readonly systemType = 'Movement';
  private readonly MOVEMENT_TOLERANCE = 0.1; // Unity units
  private readonly MAX_SPEED = 120; // feet per second (very fast for action combat)

  async update(entities: Map<string, Entity>, deltaTime: number): Promise<void> {
    for (const [id, entity] of entities) {
      const transform = entity.getComponent<TransformComponent>('Transform');
      const movement = entity.getComponent<MovementComponent>('Movement');
      
      if (!transform || !movement || !movement.enabled || !movement.isMoving) {
        continue;
      }

      await this.updateEntityMovement(entity, transform, movement, deltaTime);
    }
  }

  private async updateEntityMovement(
    entity: Entity, 
    transform: TransformComponent, 
    movement: MovementComponent, 
    deltaTime: number
  ): Promise<void> {
    if (!movement.targetPosition) {
      movement.isMoving = false;
      return;
    }

    const currentPos = transform.position;
    const targetPos = movement.targetPosition;

    // Calculate distance to target
    const dx = targetPos.x - currentPos.x;
    const dy = targetPos.y - currentPos.y;
    const dz = targetPos.z - currentPos.z;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check if reached destination
    if (distanceToTarget <= this.MOVEMENT_TOLERANCE) {
      transform.setPosition(targetPos.x, targetPos.y, targetPos.z);
      movement.isMoving = false;
      movement.targetPosition = undefined;
      return;
    }

    // Calculate movement for this frame
    const moveSpeed = Math.min(movement.speed, this.MAX_SPEED);
    const moveDistance = moveSpeed * deltaTime;

    // Don't overshoot the target
    const actualMoveDistance = Math.min(moveDistance, distanceToTarget);

    // Calculate new position
    const moveRatio = actualMoveDistance / distanceToTarget;
    const newX = currentPos.x + (dx * moveRatio);
    const newY = currentPos.y + (dy * moveRatio);
    const newZ = currentPos.z + (dz * moveRatio);

    // Update position
    transform.setPosition(newX, newY, newZ);

    // Update movement tracking for combat system
    const combat = entity.getComponent<CombatComponent>('Combat');
    if (combat?.inCombat) {
      const usedMovement = actualMoveDistance;
      movement.useMovement(usedMovement);
      
      // Stop if out of movement
      if (movement.currentMovement <= 0) {
        movement.isMoving = false;
        movement.targetPosition = undefined;
      }
    }
  }

  // Utility method for pathfinding (simplified)
  public setMovementTarget(entity: Entity, targetX: number, targetY: number, targetZ: number): boolean {
    const movement = entity.getComponent<MovementComponent>('Movement');
    const combat = entity.getComponent<CombatComponent>('Combat');
    
    if (!movement) return false;

    // Check if movement is allowed (not in combat or has movement left)
    if (combat?.inCombat && movement.currentMovement <= 0) {
      return false;
    }

    movement.setTarget(targetX, targetY, targetZ);
    return true;
  }

  // Check if entity can move to position
  public canMoveTo(entity: Entity, targetX: number, targetY: number, targetZ: number): boolean {
    const transform = entity.getComponent<TransformComponent>('Transform');
    const movement = entity.getComponent<MovementComponent>('Movement');
    const combat = entity.getComponent<CombatComponent>('Combat');
    
    if (!transform || !movement) return false;

    const distance = this.calculateDistance(
      transform.position, 
      { x: targetX, y: targetY, z: targetZ }
    );

    // Check movement allowance in combat
    if (combat?.inCombat) {
      return distance <= movement.currentMovement;
    }

    return true;
  }

  private calculateDistance(pos1: {x: number, y: number, z: number}, pos2: {x: number, y: number, z: number}): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}