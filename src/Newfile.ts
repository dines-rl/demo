let global = 1;

export function CreateFarm(animals: string[]): string {
  let farm = "";
  for (let i = 0; i < animals.length; i++) {
    farm += `In our farm we have ${animals[i]}, `;
  }
  return farm;
}

export function CountSheep(sheep: number): string {
  let count = "";
  for (let i = 1; i <= sheep; i++) {
    count += `${i} sheep...`;
  }
  return count;
}

export function CountCows(cows: number): string {
  let count = "";
  for (let i = 1; i <= cows; i++) {
    count += `${i} cows...`;
  }
  return count;
}

export function CountPigs(pigs: number): string {
  let count = "";
  for (let i = 1; i <= pigs; i++) {
    count += `${i} pigs...`;
  }
  return count;
}
