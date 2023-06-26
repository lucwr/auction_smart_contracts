import { DeployFunction } from "hardhat-deploy/types";
import { TestERC20__factory } from "../types";
import { Ship } from "../utils";

const func: DeployFunction = async (hre) => {
  const { deploy } = await Ship.init(hre);

  await deploy(TestERC20__factory);
};

export default func;
func.tags = ["mocks"];
