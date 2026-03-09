import { Vector2D, type Vector2Like } from "@/physics/vector2d";

export type MotionState = {
  position: Vector2D;
  velocity: Vector2D;
};

export function symplecticEulerCromerStep(
  state: MotionState,
  dt: number,
  accelerationAt: (position: Vector2Like) => Vector2Like,
): MotionState {
  const acceleration = Vector2D.from(accelerationAt(state.position));
  const nextVelocity = state.velocity.add(acceleration.scale(dt));
  const nextPosition = state.position.add(nextVelocity.scale(dt));

  return {
    position: nextPosition,
    velocity: nextVelocity,
  };
}
