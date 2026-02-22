export class SkillEffectFactory {
  constructor(private scene: Phaser.Scene) {}

  createProjectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const proj = this.scene.add.circle(from.x, from.y, 6, color);

      this.scene.tweens.add({
        targets: proj,
        x: to.x,
        y: to.y,
        duration,
        ease: 'Power2',
        onComplete: () => {
          proj.destroy();
          resolve();
        },
      });
    });
  }

  createAoEBlast(
    center: { x: number; y: number },
    color: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const circle = this.scene.add.circle(center.x, center.y, 10, color, 0.4);

      this.scene.tweens.add({
        targets: circle,
        scaleX: 12,
        scaleY: 12,
        alpha: 0,
        duration,
        ease: 'Power1',
        onComplete: () => {
          circle.destroy();
          resolve();
        },
      });
    });
  }

  createHealEffect(target: { x: number; y: number }, duration: number): void {
    const glow = this.scene.add.circle(target.x, target.y, 30, 0x4ecdc4, 0.4);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration,
      onComplete: () => glow.destroy(),
    });
  }

  createBuffParticles(
    target: { x: number; y: number },
    color: number,
    direction: 'up' | 'down',
    duration: number,
  ): void {
    for (let i = 0; i < 6; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const particle = this.scene.add.circle(
        target.x + offsetX,
        target.y,
        3,
        color,
        0.8,
      );

      const dirMult = direction === 'up' ? -1 : 1;
      this.scene.tweens.add({
        targets: particle,
        y: target.y + dirMult * 60,
        alpha: 0,
        duration: duration * 0.8,
        delay: i * 50,
        ease: 'Power1',
        onComplete: () => particle.destroy(),
      });
    }
  }
}
