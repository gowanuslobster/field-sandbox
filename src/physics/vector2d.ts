export type Vector2Like = {
  x: number;
  y: number;
};

export class Vector2D {
  public readonly x: number;
  public readonly y: number;

  public constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  public static from(value: Vector2Like): Vector2D {
    return new Vector2D(value.x, value.y);
  }

  public add(other: Vector2Like): Vector2D {
    return new Vector2D(this.x + other.x, this.y + other.y);
  }

  public subtract(other: Vector2Like): Vector2D {
    return new Vector2D(this.x - other.x, this.y - other.y);
  }

  public scale(factor: number): Vector2D {
    return new Vector2D(this.x * factor, this.y * factor);
  }

  public dot(other: Vector2Like): number {
    return this.x * other.x + this.y * other.y;
  }

  public magnitudeSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  public magnitude(): number {
    return Math.sqrt(this.magnitudeSquared());
  }

  public normalized(epsilon = 1e-9): Vector2D {
    const mag = this.magnitude();
    if (mag < epsilon) {
      return new Vector2D(0, 0);
    }
    return this.scale(1 / mag);
  }

  public distanceTo(other: Vector2Like): number {
    return this.subtract(other).magnitude();
  }
}
