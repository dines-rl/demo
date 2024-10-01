import { describe, expect, test } from "vitest";
import {
  CountSheep,
  CountCows,
  CountPigs,
  DisplayAnimalTypes,
} from "./Farm2.js";

describe("FarmTest", () => {
  test("DisplayAnimalTypes", () => {
    const animals = ["cow", "sheep", "pig"];
    const farm = DisplayAnimalTypes(animals);
    expect(farm).toBe("Farm has 1 cows, \n1 sheep, \n1 pigs. \n3 total");
  });

  test("CountSheep", () => {
    const animals = ["cow", "sheep", "pig"];
    const sheepCount = CountSheep(animals);
    expect(sheepCount).toBe(1);
  });

  test("CountCows", () => {
    const animals = ["cow", "sheep", "pig"];
    const cowCount = CountCows(animals);
    expect(cowCount).toBe(1);
  });

  test("CountPigs", () => {
    const animals = ["cow", "sheep", "pig"];
    const pigCount = CountPigs(animals);
    expect(pigCount).toBe(1);
  });
});
