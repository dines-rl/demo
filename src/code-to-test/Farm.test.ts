import { describe, expect, test } from "vitest";
import {
  CountSheep,
  CountCows,
  CountPigs,
  DisplayAnimalTypes,
} from "./Farm.js";

describe("FarmTest", () => {
  describe("DisplayAnimalTypes", () => {
    test("displays correct counts for a mixed farm", () => {
      const animals = ["cow", "sheep", "pig"];
      const farm = DisplayAnimalTypes(animals);
      expect(farm).toBe("Farm has 1 cows, \n1 sheep, \n1 pigs. \n3 total");
    });

    test("displays all zeros for an empty farm", () => {
      const farm = DisplayAnimalTypes([]);
      expect(farm).toBe("Farm has 0 cows, \n0 sheep, \n0 pigs. \n0 total");
    });

    test("counts multiple of the same animal", () => {
      const animals = ["cow", "cow", "cow"];
      const farm = DisplayAnimalTypes(animals);
      expect(farm).toBe("Farm has 3 cows, \n0 sheep, \n0 pigs. \n3 total");
    });

    test("includes unrecognized animals in total but not in individual counts", () => {
      const animals = ["cow", "horse", "dog"];
      const farm = DisplayAnimalTypes(animals);
      expect(farm).toBe("Farm has 1 cows, \n0 sheep, \n0 pigs. \n3 total");
    });

    test("handles large mixed farm", () => {
      const animals = [
        "cow", "cow", "sheep", "sheep", "sheep",
        "pig", "pig", "pig", "pig", "horse",
      ];
      const farm = DisplayAnimalTypes(animals);
      expect(farm).toBe("Farm has 2 cows, \n3 sheep, \n4 pigs. \n10 total");
    });
  });

  describe("CountSheep", () => {
    test("counts sheep correctly", () => {
      expect(CountSheep(["cow", "sheep", "pig"])).toBe(1);
    });

    test("returns 0 when no sheep", () => {
      expect(CountSheep(["cow", "pig"])).toBe(0);
    });

    test("counts multiple sheep", () => {
      expect(CountSheep(["sheep", "sheep", "sheep"])).toBe(3);
    });

    test("returns 0 for empty array", () => {
      expect(CountSheep([])).toBe(0);
    });
  });

  describe("CountCows", () => {
    test("counts cows correctly", () => {
      expect(CountCows(["cow", "sheep", "pig"])).toBe(1);
    });

    test("returns 0 when no cows", () => {
      expect(CountCows(["sheep", "pig"])).toBe(0);
    });

    test("counts multiple cows", () => {
      expect(CountCows(["cow", "cow"])).toBe(2);
    });

    test("returns 0 for empty array", () => {
      expect(CountCows([])).toBe(0);
    });
  });

  describe("CountPigs", () => {
    test("counts pigs correctly", () => {
      expect(CountPigs(["cow", "sheep", "pig"])).toBe(1);
    });

    test("returns 0 when no pigs", () => {
      expect(CountPigs(["cow", "sheep"])).toBe(0);
    });

    test("counts multiple pigs", () => {
      expect(CountPigs(["pig", "pig", "pig", "pig"])).toBe(4);
    });

    test("returns 0 for empty array", () => {
      expect(CountPigs([])).toBe(0);
    });
  });
});
