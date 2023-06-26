import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

task("upload", "Verfies deployed contract")
  .addParam("contract", "Name of contract")
  .setAction(async (taskArgs, hre) => {
    const contractName = taskArgs.contract;
    const contract = await getContractSource(hre, contractName);
    const networkName = hre.network.name;
    const artifacts = require(`../deployments/${networkName}/${contractName}.json`);
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const constructorArguments = (artifacts.args as any[]) || [];
    const address = artifacts.address as string;

    await hre.run("verify:verify", {
      address,
      constructorArguments,
      contract,
    });
  });

task("upload:batch", "Verfies deployed contracts")
  .addParam("contracts", "Names of contracts")
  .setAction(async (taskArgs, hre) => {
    const networkName = hre.network.name;
    const rawInput = taskArgs.contracts as string;
    const contractNames = rawInput.split(",") as string[];
    for (const contractName of contractNames) {
      const contract = await getContractSource(hre, contractName);
      const artifacts = require(`../deployments/${networkName}/${contractName}.json`);
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const constructorArguments = (artifacts.args as any[]) || [];
      const address = artifacts.address as string;
      try {
        await hre.run("verify:verify", {
          address,
          constructorArguments,
          contract,
        });
      } catch (error) {
        console.error(error);
      }
    }
  });

task("upload:all", "Verfies all deployed contracts").setAction(async (taskArgs, hre) => {
  const networkName = hre.network.name;
  const directory = `./deployments/${networkName}`;
  const files = fs.readdirSync(directory);
  const contractNames = files
    .filter((file: string) => {
      // get the details of the file
      const fileDetails = fs.lstatSync(path.resolve(directory, file));
      const extension = file.split(".")?.at(1) ?? "";
      // check if the file is directory
      if (fileDetails.isDirectory() || extension != "json") {
        return false;
      } else {
        return true;
      }
    })
    .map((file) => file.split(".")[0]);
  for (const contractName of contractNames) {
    const contract = await getContractSource(hre, contractName);
    const artifacts = require(`../deployments/${networkName}/${contractName}.json`);
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const constructorArguments = (artifacts.args as any[]) || [];
    const address = artifacts.address as string;
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments,
        contract,
      });
    } catch (error) {
      console.error(error);
    }
  }
});

const getContractSource = async (
  hre: HardhatRuntimeEnvironment,
  contractName: string,
): Promise<string | undefined> => {
  const sourceNames = await hre.artifacts.getAllFullyQualifiedNames();

  for (let i = 0; i < sourceNames.length; i++) {
    const parts = sourceNames[i].split(":");
    if (parts[1] === contractName) {
      return sourceNames[i];
    }
  }
  return undefined;
};
