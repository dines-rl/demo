import { describe, expect, test } from "vitest";
import {
  CountSheep,
  CountCows,
  CountPigs,
  DisplayAnimalTypes,
} from "./Farm2.js";

describe("FarmTest", () => {
test("should correctly display the types and counts of animals", () => {
    const animals = ["cow", "sheep", "pig"];
    const farm = DisplayAnimalTypes(animals);
    expect(farm).toBe("Farm has 1 cows, \n1 sheep, \n1 pigs. \n3 total");
  });

test("should correctly count the number of sheep", () => {
    const animals = ["cow", "sheep", "pig"];
    const sheepCount = CountSheep(animals);
    expect(sheepCount).toBe(1);
  });

test("should correctly count the number of cows", () => {
    const animals = ["cow", "sheep", "pig"];
    const cowCount = CountCows(animals);
    expect(cowCount).toBe(1);
  });

test("should correctly count the number of pigs", () => {
    const animals = ["cow", "sheep", "pig"];
    const pigCount = CountPigs(animals);
    expect(pigCount).toBe(1);
  });
});
