import { deployments } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Ship, advanceBlockBy } from "../utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { EnglishAuction, EnglishAuction__factory, TestERC20, TestERC20__factory } from "../types";
import { parseUnits } from "ethers/lib/utils";

chai.use(solidity);
const { expect } = chai;

let ship: Ship;
let token: TestERC20;
let auction: EnglishAuction;

let deployer: SignerWithAddress;
let alice: SignerWithAddress;
let bob: SignerWithAddress;

const setup = deployments.createFixture(async (hre) => {
  ship = await Ship.init(hre);
  const { accounts, users } = ship;
  await deployments.fixture(["english-auction"]);

  return {
    ship,
    accounts,
    users,
  };
});

describe("EnglishAuction test", () => {
  before(async () => {
    const { accounts } = await setup();

    deployer = accounts.deployer;
    alice = accounts.alice;
    bob = accounts.bob;

    token = await ship.connect(TestERC20__factory);
    auction = await ship.connect(EnglishAuction__factory);

    // distribute tokens to do test
    await token.connect(deployer).transfer(alice.address, parseUnits("10"));
    await token.connect(deployer).transfer(bob.address, parseUnits("10"));

    // approve tokens to auction contract
    await token.connect(deployer).approve(auction.address, parseUnits("100"));
    await token.connect(alice).approve(auction.address, parseUnits("100"));
    await token.connect(bob).approve(auction.address, parseUnits("100"));
  });

  it("auction params test", async () => {
    expect(await auction.assetType()).to.eq(1); // ERC20
    expect(await auction.assetAddress()).to.eq(token.address);
    expect(await auction.assetParam()).to.eq(parseUnits("1"));
    expect(await auction.bidToken()).to.eq(token.address);
  });

  it("start auction", async () => {
    await expect(auction.start()).to.emit(auction, "AuctionStarted");

    expect(await token.balanceOf(auction.address)).to.eq(parseUnits("1"));
  });

  it("bids", async () => {
    await expect(auction.connect(alice).propose(parseUnits("0.5")))
      .to.emit(token, "Transfer")
      .withArgs(alice.address, auction.address, parseUnits("0.5"))
      .to.emit(auction, "NewBid")
      .withArgs(alice.address, parseUnits("0.5"));

    expect(await auction.lastPrice()).to.eq(parseUnits("0.5"));
    expect(await auction.lastBidder()).to.eq(alice.address);
    expect(await token.balanceOf(auction.address)).to.eq(parseUnits("1.5"));

    await expect(auction.connect(bob).propose(parseUnits("0.5"))).to.revertedWith(
      "Auction: bid price is low than last one",
    );

    await expect(auction.connect(bob).propose(parseUnits("0.6")))
      .to.emit(token, "Transfer")
      .withArgs(bob.address, auction.address, parseUnits("0.6"))
      .to.emit(auction, "NewBid")
      .withArgs(bob.address, parseUnits("0.6"));

    expect(await auction.lastPrice()).to.eq(parseUnits("0.6"));
    expect(await auction.lastBidder()).to.eq(bob.address);
    expect(await token.balanceOf(auction.address)).to.eq(parseUnits("1.6"));
  });

  it("finish auction", async () => {
    await expect(auction.finish()).to.revertedWith("Auction: auction not finished");

    await advanceBlockBy(4);

    await expect(auction.finish()).to.emit(auction, "Finished").withArgs(bob.address, parseUnits("0.6"));
  });
});
