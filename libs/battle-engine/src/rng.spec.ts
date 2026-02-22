import { SeededRandom } from './rng';

describe('SeededRandom', () => {
  it('should produce deterministic results with the same seed', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);

    const results1 = Array.from({ length: 100 }, () => rng1.next());
    const results2 = Array.from({ length: 100 }, () => rng2.next());

    expect(results1).toEqual(results2);
  });

  it('should produce different results with different seeds', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(67890);

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).not.toEqual(results2);
  });

  it('should return values in [0, 1)', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextInt should return integers in the given range', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('chance should return boolean', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.chance(0.5);
      expect(typeof val).toBe('boolean');
    }
  });

  it('pick should return an element from the array', () => {
    const rng = new SeededRandom(42);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('shuffle should be deterministic', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    rng1.shuffle(arr1);
    rng2.shuffle(arr2);

    expect(arr1).toEqual(arr2);
  });
});
