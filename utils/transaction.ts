import { ContractTransaction } from "ethers";

export const reportGasUsed = async (tx: ContractTransaction, label: string) => {
  const { gasUsed } = await tx.wait();
  console.info(label, gasUsed.toString());
  return gasUsed;
};

export const getTxFees = async (tx: ContractTransaction) => {
  const receipt = await tx.wait();
  // use receipt.effectiveGasPrice for newer versions of hardhat
  return receipt.effectiveGasPrice.mul(receipt.gasUsed);
};
