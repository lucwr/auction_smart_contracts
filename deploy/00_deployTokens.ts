import { DeployFunction } from "hardhat-deploy/types";
import { XDX__factory, EsXDX__factory, MintableBaseToken__factory } from "../../types";
import { Ship } from "../utils";

const func: DeployFunction = async (hre) => {
  const { deploy } = await Ship.init(hre);
  await deploy(XDX__factory);

  const esXdx = await deploy(EsXDX__factory);
  if (esXdx.newlyDeployed) {
    const tx = await esXdx.contract.setInPrivateTransferMode(true);
    console.log("Set private transfer mode to esXdx at ", tx.hash);
    await tx.wait();
  }

  await deploy(MintableBaseToken__factory, {
    aliasName: "BN_XDX",
    args: ["Bonus XDX", "bnXDX", 0],
  });
  await deploy(MintableBaseToken__factory, {
    aliasName: "ES_XDX_IOU",
    args: ["esXDX IOU", "esXDX:IOU", 0],
  });
};

export default func;
func.tags = ["xdx", "esXdx", "bnXdx", "exXdxIou"];
