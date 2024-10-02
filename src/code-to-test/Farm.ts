let global = 1;

export function DisplayAnimalTypes(animals: string[]): string {
  let cows = CountCows(animals);
  let sheep = CountSheep(animals);
  let pigs = CountPigs(animals);
  return `Farm has ${cows} cows, \n${sheep} sheep, \n${pigs} pigs. \n${animals.length} total`;
}

export function CountSheep(animals: string[]): number {
  return animals.filter((animal) => animal === "sheep").length;
}

export function CountCows(animals: string[]): number {
  return animals.filter((animal) => animal === "cow").length;
}

export function CountPigs(animals: string[]): number {
  return animals.filter((animal) => animal === "pig").length;
}
