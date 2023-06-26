import { USDG, USDG__factory } from "../../types";
import { deployments } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Ship } from "../utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

let ship: Ship;
let usdg: USDG;

let alice: SignerWithAddress;
let bob: SignerWithAddress;

const setup = deployments.createFixture(async (hre) => {
  ship = await Ship.init(hre);
  const { accounts, users } = ship;
  await deployments.fixture(["usdg"]);

    ship,
    accounts,
    users,
  };
});

describe("USDG", () => {
  beforeEach(async () => {
    const { accounts, users } = await setup();
    alice = accounts.alice;
    bob = accounts.bob;

    usdg = await ship.connect(USDG__factory);
    await usdg.addVault(bob.address);
  });

  it("addVault", async () => {
    await expect(usdg.connect(alice).addVault(alice.address)).to.be.revertedWith("YieldToken: forbidden");

    await usdg.setGov(alice.address);

    expect(await usdg.vaults(alice.address)).eq(false);
    await usdg.connect(alice).addVault(alice.address);
    expect(await usdg.vaults(alice.address)).eq(true);
  });

  it("removeVault", async () => {
    await expect(usdg.connect(alice).removeVault(alice.address)).to.be.revertedWith("YieldToken: forbidden");

    await usdg.setGov(alice.address);

    expect(await usdg.vaults(alice.address)).eq(false);
    await usdg.connect(alice).addVault(alice.address);
    expect(await usdg.vaults(alice.address)).eq(true);
    await usdg.connect(alice).removeVault(alice.address);
    expect(await usdg.vaults(alice.address)).eq(false);
  });

  it("mint", async () => {
    expect(await usdg.balanceOf(bob.address)).eq(0);
    await usdg.connect(bob).mint(bob.address, 1000);
    expect(await usdg.balanceOf(bob.address)).eq(1000);
    expect(await usdg.totalSupply()).eq(1000);

    await expect(usdg.connect(alice).mint(bob.address, 1000)).to.be.revertedWith("USDG: forbidden");

    await usdg.addVault(alice.address);

    expect(await usdg.balanceOf(bob.address)).eq(1000);
    await usdg.connect(alice).mint(bob.address, 500);
    expect(await usdg.balanceOf(bob.address)).eq(1500);
    expect(await usdg.totalSupply()).eq(1500);
  });

  it("burn", async () => {
    expect(await usdg.balanceOf(bob.address)).eq(0);
    await usdg.connect(bob).mint(bob.address, 1000);
    expect(await usdg.balanceOf(bob.address)).eq(1000);
    await usdg.connect(bob).burn(bob.address, 300);
    expect(await usdg.balanceOf(bob.address)).eq(700);
    expect(await usdg.totalSupply()).eq(700);

    await expect(usdg.connect(alice).burn(bob.address, 100)).to.be.revertedWith("USDG: forbidden");

    await usdg.addVault(alice.address);

    await usdg.connect(alice).burn(bob.address, 100);
    expect(await usdg.balanceOf(bob.address)).eq(600);
    expect(await usdg.totalSupply()).eq(600);
  });
});
